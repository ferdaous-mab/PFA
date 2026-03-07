from sqlalchemy import Column, Integer, String, DateTime, Boolean, LargeBinary
from datetime import datetime
from database.config import Base

class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    nom = Column(String(50), nullable=False)
    prenom = Column(String(50), nullable=False)
    email_academique = Column(String(100), unique=True, nullable=False)
    classe = Column(String(50), nullable=False)
    annee_scolaire = Column(String(20), nullable=False)
    face_encoding = Column(LargeBinary, unique=True, nullable=False)  # vecteur encodé du visage
    date_inscription = Column(DateTime, default=datetime.utcnow)

