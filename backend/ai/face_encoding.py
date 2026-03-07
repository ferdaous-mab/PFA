import numpy as np
import pickle
from PIL import Image
import io
from deepface import DeepFace

def generate_face_encoding(image_bytes: bytes) -> bytes:
    # Lire l'image avec PIL
    image_pil = Image.open(io.BytesIO(image_bytes))
    image_pil = image_pil.convert("RGB")
    image_rgb = np.array(image_pil, dtype=np.uint8)

    print(f"Shape: {image_rgb.shape}, dtype: {image_rgb.dtype}")

    # Générer l'embedding avec DeepFace
    result = DeepFace.represent(
        img_path=image_rgb,
        model_name="Facenet",
        enforce_detection=True
    )

    encoding_vector = np.array(result[0]["embedding"], dtype=np.float64)
    print(f"Encoding généré : {len(encoding_vector)} floats")
    
    return pickle.dumps(encoding_vector)


def decode_face_encoding(encoding_bytes: bytes) -> np.ndarray:
    return pickle.loads(encoding_bytes)