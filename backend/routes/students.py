from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from sqlalchemy.orm import Session
from database.config import SessionLocal
from database.models import Student
from ai.face_encoding import (
    detect_face_angle,
    generate_encoding_for_angle,
    compute_final_encoding,
)

router = APIRouter()

ANGLES_REQUIRED = ["face", "gauche", "droite", "haut", "bas", "diag_gauche", "diag_droite"]

ANGLE_INSTRUCTIONS = {
    "face":        "Regardez droit devant",
    "gauche":      "Tournez la tête à gauche",
    "droite":      "Tournez la tête à droite",
    "haut":        "Regardez vers le haut",
    "bas":         "Regardez vers le bas",
    "diag_gauche": "Tournez en haut à gauche",
    "diag_droite": "Tournez en haut à droite",
}


# ── Session DB ────────────────────────────────────────────────────────────────
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Route : angles requis ─────────────────────────────────────────────────────
@router.get("/angles-requis")
def get_angles_requis():
    return {
        "angles":       ANGLES_REQUIRED,
        "instructions": ANGLE_INSTRUCTIONS,
        "total":        len(ANGLES_REQUIRED)
    }


# ── Route : scanner un angle ──────────────────────────────────────────────────
@router.post("/scan-angle")
async def scan_angle(image: UploadFile = File(...)):
    image_bytes = await image.read()
    result = detect_face_angle(image_bytes)

    # Ne pas lever d'exception si pas de visage — le frontend gère ça
    return {
        "detected":    result["detected"],
        "angle":       result.get("angle"),
        "yaw":         result.get("yaw", 0),
        "pitch":       result.get("pitch", 0),
        "instruction": result.get("instruction", ""),
    }


# ── Route : inscription complète ──────────────────────────────────────────────
@router.post("/inscrire-complet")
async def inscrire_etudiant_complet(
    nom:               str        = Form(...),
    prenom:            str        = Form(...),
    email_academique:  str        = Form(...),
    classe:            str        = Form(...),
    annee_scolaire:    str        = Form(...),
    image_face:        UploadFile = File(...),
    image_gauche:      UploadFile = File(...),
    image_droite:      UploadFile = File(...),
    image_haut:        UploadFile = File(...),
    image_bas:         UploadFile = File(...),
    image_diag_gauche: UploadFile = File(...),
    image_diag_droite: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    # 1. Email unique
    if db.query(Student).filter(Student.email_academique == email_academique).first():
        raise HTTPException(status_code=400, detail="Cet email est déjà inscrit.")

    # 2. Lire les 7 images
    images = {
        "face":        await image_face.read(),
        "gauche":      await image_gauche.read(),
        "droite":      await image_droite.read(),
        "haut":        await image_haut.read(),
        "bas":         await image_bas.read(),
        "diag_gauche": await image_diag_gauche.read(),
        "diag_droite": await image_diag_droite.read(),
    }

    # 3. Générer les embeddings ArcFace
    encodings = []
    for angle_name, img_bytes in images.items():
        try:
            encoding = generate_encoding_for_angle(img_bytes)
            encodings.append(encoding)
            print(f"✅ Angle {angle_name} encodé")
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Erreur sur l'angle '{angle_name}': {str(e)}"
            )

    # 4. Encoding final (moyenne des 7)
    final_encoding_bytes = compute_final_encoding(encodings)
    print(f"✅ Encoding final calculé ({len(encodings)} angles)")

    # 5. Sauvegarder
    nouvel_etudiant = Student(
        nom=nom,
        prenom=prenom,
        email_academique=email_academique,
        classe=classe,
        annee_scolaire=annee_scolaire,
        face_encoding=final_encoding_bytes
    )
    db.add(nouvel_etudiant)
    db.commit()
    db.refresh(nouvel_etudiant)

    return {
        "message":         "Inscription réussie !",
        "etudiant_id":     nouvel_etudiant.id,
        "nom":             nouvel_etudiant.nom,
        "prenom":          nouvel_etudiant.prenom,
        "angles_captures": len(encodings)
    }