import cv2
import face_recognition
import numpy as np
import pickle


def generate_face_encoding(image_bytes: bytes) -> bytes:
    """
    Reçoit une image en bytes (envoyée par le frontend)
    Retourne le face_encoding sérialisé prêt pour PostgreSQL
    """

    # Étape 1 : Convertir les bytes en image numpy via OpenCV
    image_np = np.frombuffer(image_bytes, dtype=np.uint8)
    image_bgr = cv2.imdecode(image_np, cv2.IMREAD_COLOR)

    if image_bgr is None:
        raise ValueError("Image invalide ou corrompue.")

    # Étape 2 : Convertir BGR (OpenCV) → RGB (face_recognition)
    image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)

    # Étape 3 : Détecter le(s) visage(s) dans l'image
    face_locations = face_recognition.face_locations(image_rgb, model="hog")

    if len(face_locations) == 0:
        raise ValueError("Aucun visage détecté. Veuillez reprendre la photo.")

    if len(face_locations) > 1:
        raise ValueError("Plusieurs visages détectés. Veuillez être seul dans l'image.")

    # Étape 4 : Calculer le vecteur de 128 floats
    encodings = face_recognition.face_encodings(image_rgb, face_locations)

    if len(encodings) == 0:
        raise ValueError("Impossible de calculer l'encoding. Réessayez avec une meilleure image.")

    encoding_vector = encodings[0]  # numpy array de 128 floats

    # Étape 5 : Sérialiser avec pickle pour stockage en LargeBinary dans PostgreSQL
    encoding_bytes = pickle.dumps(encoding_vector)

    return encoding_bytes


def decode_face_encoding(encoding_bytes: bytes) -> np.ndarray:
    """
    Désérialise un face_encoding stocké en base
    Utilisé plus tard pour la reconnaissance en classe
    """
    return pickle.loads(encoding_bytes)