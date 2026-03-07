from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from sqlalchemy.orm import Session
from database.config import SessionLocal
from database.models import Student
from ai.face_encoding import generate_face_encoding

router = APIRouter()

# Dépendance pour obtenir la session base de données
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/inscrire")
async def inscrire_etudiant(
    nom: str = Form(...),
    prenom: str = Form(...),
    email_academique: str = Form(...),
    classe: str = Form(...),
    annee_scolaire: str = Form(...),
    image: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    # Étape 1 : Vérifier si l'email existe déjà
    etudiant_existant = db.query(Student).filter(Student.email_academique == email_academique).first()
    if etudiant_existant:
        raise HTTPException(status_code=400, detail="Cet email est déjà inscrit.")

    # Étape 2 : Lire l'image envoyée par le frontend
    image_bytes = await image.read()

    # Étape 3 : Générer le face encoding via le module IA
    try:
        encoding_bytes = generate_face_encoding(image_bytes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Étape 4 : Créer l'objet Student
    nouvel_etudiant = Student(
        nom=nom,
        prenom=prenom,
        email_academique=email_academique,
        classe=classe,
        annee_scolaire=annee_scolaire,
        face_encoding=encoding_bytes
    )

    # Étape 5 : Sauvegarder dans PostgreSQL
    db.add(nouvel_etudiant)
    db.commit()
    db.refresh(nouvel_etudiant)

    # Étape 6 : Retourner message succès
    return {
        "message": "Inscription réussie !",
        "etudiant_id": nouvel_etudiant.id,
        "nom": nouvel_etudiant.nom,
        "prenom": nouvel_etudiant.prenom
    }