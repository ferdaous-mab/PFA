from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from sqlalchemy.orm import Session
from database.config import SessionLocal
from database.models import Student
from ai.face_encoding import (
    detect_face_angle,
    generate_encoding_for_angle,
    compute_final_encoding,
    ANGLES_REQUIRED,
    ANGLE_INSTRUCTIONS
)

router = APIRouter()


# -----------------------------
# DB session
# -----------------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# -----------------------------
# Route : angles requis
# -----------------------------
@router.get("/angles-requis")
def get_angles_requis():
    """
    Retourne la liste des angles requis avec leurs instructions
    """
    return {
        "angles": ANGLES_REQUIRED,
        "instructions": ANGLE_INSTRUCTIONS,
        "total": len(ANGLES_REQUIRED)
    }


# -----------------------------
# Route : scanner un angle
# -----------------------------
@router.post("/scan-angle")
async def scan_angle(image: UploadFile = File(...)):
    """
    Reçoit une image → détecte l'angle du visage
    Retourne l'angle détecté et si le visage est bien visible
    """
    image_bytes = await image.read()
    result = detect_face_angle(image_bytes)

    if not result["detected"]:
        raise HTTPException(status_code=400, detail="Aucun visage détecté dans l'image.")

    return {
        "detected": result["detected"],
        "angle": result["angle"],
        "yaw": result["yaw"],
        "pitch": result["pitch"],
        "instruction": ANGLE_INSTRUCTIONS.get(result["angle"], "")
    }


# -----------------------------
# Route : inscription complet
# -----------------------------
@router.post("/inscrire-complet")
async def inscrire_etudiant_complet(
    nom: str = Form(...),
    prenom: str = Form(...),
    email_academique: str = Form(...),
    classe: str = Form(...),
    annee_scolaire: str = Form(...),
    image_face: UploadFile = File(...),
    image_gauche: UploadFile = File(...),
    image_droite: UploadFile = File(...),
    image_haut: UploadFile = File(...),
    image_bas: UploadFile = File(...),
    image_diag_gauche: UploadFile = File(...),
    image_diag_droite: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Reçoit les 7 images des angles + données formulaire
    Calcule le encoding moyen via ArcFace et sauvegarde dans PostgreSQL
    """

    # Vérifier si l'email existe déjà
    if db.query(Student).filter(Student.email_academique == email_academique).first():
        raise HTTPException(status_code=400, detail="Cet email est déjà inscrit.")

    # Lire les 7 images
    images = {
        "face": await image_face.read(),
        "gauche": await image_gauche.read(),
        "droite": await image_droite.read(),
        "haut": await image_haut.read(),
        "bas": await image_bas.read(),
        "diag_gauche": await image_diag_gauche.read(),
        "diag_droite": await image_diag_droite.read(),
    }

    # Générer l'encoding pour chaque angle
    encodings = []
    for angle_name, img_bytes in images.items():
        try:
            encoding = generate_encoding_for_angle(img_bytes)
            encodings.append(encoding)
            print(f"✅ Angle {angle_name} encodé")
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Erreur sur l'angle {angle_name}: {str(e)}"
            )

    # Calculer le encoding final (moyenne des 7 angles)
    final_encoding_bytes = compute_final_encoding(encodings)
    print(f"✅ Encoding final calculé ({len(encodings)} angles)")

    # Sauvegarder dans PostgreSQL
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
        "message": "Inscription réussie !",
        "etudiant_id": nouvel_etudiant.id,
        "nom": nouvel_etudiant.nom,
        "prenom": nouvel_etudiant.prenom,
        "angles_captures": len(encodings)
    }