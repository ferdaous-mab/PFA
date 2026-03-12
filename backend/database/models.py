from sqlalchemy import Column, Integer, String, DateTime, LargeBinary, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from database.config import Base


class Student(Base):
    __tablename__ = "students"

    id               = Column(Integer, primary_key=True, index=True)
    nom              = Column(String(50),  nullable=False)
    prenom           = Column(String(50),  nullable=False)
    email_academique = Column(String(100), unique=True, nullable=False)
    classe           = Column(String(50),  nullable=False)
    annee_scolaire   = Column(String(20),  nullable=False)
    face_encoding    = Column(LargeBinary, nullable=False)
    date_inscription = Column(DateTime,    default=datetime.utcnow)

    # Relation vers les images
    face_images      = relationship("StudentFaceImage", back_populates="student",
                                    cascade="all, delete-orphan")


class StudentFaceImage(Base):
    __tablename__ = "student_face_images"

    id         = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    angle      = Column(String(20), nullable=False)   # face, gauche, droite, ...
    image_data = Column(LargeBinary, nullable=False)  # crop JPEG du visage
    captured_at = Column(DateTime, default=datetime.utcnow)

    # Relation inverse
    student    = relationship("Student", back_populates="face_images")