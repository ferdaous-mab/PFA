from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List, Optional
from database.config import SessionLocal
from database.models import Student, StudentFaceImage
from ai.face_encoding import (
    detect_face_angle,
    generate_encoding_for_angle,
    compute_final_encoding,
    crop_face,
)

router = APIRouter()

ANGLES_REQUIRED = ["face", "gauche", "droite", "haut", "bas", "diag_gauche", "diag_droite"]

ANGLE_INSTRUCTIONS = {
    "face":        "Regardez droit devant",
    "gauche":      "Tournez lentement à gauche",
    "droite":      "Tournez lentement à droite",
    "haut":        "Regardez vers le haut",
    "bas":         "Regardez vers le bas",
    "diag_gauche": "Continuez à tourner...",
    "diag_droite": "Continuez à tourner...",
}


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/angles-requis")
def get_angles_requis():
    return {
        "angles":       ANGLES_REQUIRED,
        "instructions": ANGLE_INSTRUCTIONS,
        "total":        len(ANGLES_REQUIRED)
    }


@router.post("/scan-angle")
async def scan_angle(
    image:            UploadFile = File(...),
    already_captured: Optional[str] = Form(default=""),  # "face,gauche,droite"
):
    """
    Reçoit une frame + liste des angles déjà capturés.
    Retourne le prochain angle détecté pas encore capturé.
    """
    image_bytes = await image.read()

    # Parser les angles déjà capturés
    captured_list = [a.strip() for a in already_captured.split(",") if a.strip()]

    result = detect_face_angle(image_bytes, already_captured=captured_list)
    return {
        "detected":    result["detected"],
        "angle":       result.get("angle"),
        "yaw":         result.get("yaw", 0),
        "pitch":       result.get("pitch", 0),
        "instruction": result.get("instruction", ""),
    }


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
            raise HTTPException(status_code=400,
                                detail=f"Erreur encoding '{angle_name}': {str(e)}")

    # 4. Encoding final → BYTEA compressé ~800 bytes
    final_encoding_bytes = compute_final_encoding(encodings)
    print(f"✅ Encoding final : {len(final_encoding_bytes)} bytes")

    # 5. Sauvegarder l'étudiant
    nouvel_etudiant = Student(
        nom=nom,
        prenom=prenom,
        email_academique=email_academique,
        classe=classe,
        annee_scolaire=annee_scolaire,
        face_encoding=final_encoding_bytes,
    )
    db.add(nouvel_etudiant)
    db.flush()

    # 6. Crop + sauvegarde images
    photos_sauvees = 0
    for angle_name, img_bytes in images.items():
        path = crop_face(img_bytes, student_id=nouvel_etudiant.id, angle=angle_name)
        if path:
            db.add(StudentFaceImage(
                student_id=nouvel_etudiant.id,
                angle=angle_name,
                image_path=path,
            ))
            photos_sauvees += 1

    db.commit()
    db.refresh(nouvel_etudiant)

    return {
        "message":         "Inscription réussie !",
        "etudiant_id":     nouvel_etudiant.id,
        "nom":             nouvel_etudiant.nom,
        "prenom":          nouvel_etudiant.prenom,
        "angles_captures": len(encodings),
        "photos_sauvees":  photos_sauvees,
        "encoding_bytes":  len(final_encoding_bytes),
    }