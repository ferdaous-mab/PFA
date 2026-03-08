import numpy as np
import pickle
from PIL import Image
import io
import cv2
from deepface import DeepFace
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision
import urllib.request
import os

# -----------------------------
# Angles requis
# -----------------------------

ANGLES_REQUIRED = [
    "face", "gauche", "droite", "haut", "bas", "diag_gauche", "diag_droite"
]

ANGLE_INSTRUCTIONS = {
    "face":        "Regardez droit devant",
    "gauche":      "Tournez la tête à gauche",
    "droite":      "Tournez la tête à droite",
    "haut":        "Regardez vers le haut",
    "bas":         "Regardez vers le bas",
    "diag_gauche": "Tournez en haut à gauche",
    "diag_droite": "Tournez en haut à droite"
}

# ✅ Seuils stricts : l'utilisateur DOIT vraiment tourner la tête
# Face : zone neutre stricte
FACE_YAW_MAX   = 8    # ±8° pour "face"
FACE_PITCH_MAX = 8    # ±8° pour "face"

# Gauche/Droite : minimum 20° de rotation horizontale
YAW_MIN        = 20

# Haut/Bas : minimum 15° de rotation verticale
PITCH_MIN      = 15

# Diagonales : minimum 15° horizontal ET 12° vertical
DIAG_YAW_MIN   = 15
DIAG_PITCH_MIN = 12


# -----------------------------
# Init MediaPipe FaceLandmarker
# -----------------------------

_MODEL_PATH = os.path.join(os.path.dirname(__file__), "face_landmarker.task")

if not os.path.exists(_MODEL_PATH):
    print("⬇️ Téléchargement du modèle MediaPipe face_landmarker.task ...")
    urllib.request.urlretrieve(
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        _MODEL_PATH
    )
    print("✅ Modèle téléchargé.")

_base_options = mp_python.BaseOptions(model_asset_path=_MODEL_PATH)
_face_landmarker_options = mp_vision.FaceLandmarkerOptions(
    base_options=_base_options,
    output_face_blendshapes=False,
    output_facial_transformation_matrixes=True,
    num_faces=1
)
_face_landmarker = mp_vision.FaceLandmarker.create_from_options(_face_landmarker_options)


# -----------------------------
# Estimation pose avec MediaPipe
# -----------------------------

def _estimate_head_pose(image_rgb: np.ndarray) -> dict | None:
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=image_rgb)
    result   = _face_landmarker.detect(mp_image)

    if not result.face_landmarks or not result.facial_transformation_matrixes:
        return None

    matrix     = np.array(result.facial_transformation_matrixes[0].data).reshape(4, 4)
    rot_matrix = matrix[:3, :3]

    pitch = np.degrees(np.arcsin(-rot_matrix[2, 0]))
    yaw   = np.degrees(np.arctan2(rot_matrix[2, 1], rot_matrix[2, 2]))
    yaw   = -yaw

    print(f"[MediaPipe] yaw={yaw:.1f}° pitch={pitch:.1f}°")

    return {
        "yaw":   round(float(yaw),   2),
        "pitch": round(float(pitch), 2),
    }


# -----------------------------
# Détection angle du visage
# -----------------------------

def detect_face_angle(image_bytes: bytes) -> dict:
    image_pil = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    image_rgb = np.array(image_pil, dtype=np.uint8)

    try:
        pose = _estimate_head_pose(image_rgb)
        if pose:
            angle = _determine_angle(pose["yaw"], pose["pitch"])
            return {
                "detected":    True,
                "angle":       angle,
                "yaw":         pose["yaw"],
                "pitch":       pose["pitch"],
                "instruction": ANGLE_INSTRUCTIONS.get(angle, "")
            }
    except Exception as e:
        print(f"⚠️ MediaPipe erreur: {e}")

    # Fallback RetinaFace
    try:
        result    = DeepFace.extract_faces(
            img_path=image_rgb,
            detector_backend="retinaface",
            enforce_detection=True,
            align=False
        )
        region    = result[0]["facial_area"]
        left_eye  = result[0].get("left_eye")
        right_eye = result[0].get("right_eye")

        if left_eye and right_eye:
            angle_data = _calculate_angle_from_landmarks(image_rgb, region, left_eye, right_eye)
        else:
            angle_data = _calculate_angle_from_region(image_rgb, region)

        return {
            "detected":    True,
            "angle":       angle_data["angle"],
            "yaw":         angle_data["yaw"],
            "pitch":       angle_data["pitch"],
            "instruction": ANGLE_INSTRUCTIONS.get(angle_data["angle"], "")
        }
    except Exception:
        return {
            "detected":    False,
            "angle":       None,
            "yaw":         0,
            "pitch":       0,
            "instruction": "Aucun visage détecté. Repositionnez-vous."
        }


# -----------------------------
# ✅ Détermination angle stricte
# -----------------------------

def _determine_angle(yaw: float, pitch: float) -> str:

    # 1. Diagonales : yaw ET pitch suffisamment grands
    if yaw < -DIAG_YAW_MIN and pitch < -DIAG_PITCH_MIN:
        return "diag_gauche"
    if yaw > DIAG_YAW_MIN and pitch < -DIAG_PITCH_MIN:
        return "diag_droite"

    # 2. Face : zone centrale stricte
    if abs(yaw) <= FACE_YAW_MAX and abs(pitch) <= FACE_PITCH_MAX:
        return "face"

    # 3. Gauche / Droite : rotation horizontale prononcée
    if yaw < -YAW_MIN:
        return "gauche"
    if yaw > YAW_MIN:
        return "droite"

    # 4. Haut / Bas : rotation verticale prononcée
    if pitch < -PITCH_MIN:
        return "haut"
    if pitch > PITCH_MIN:
        return "bas"

    # Zone grise → on ne valide pas, retourne None pour forcer l'utilisateur
    return None


# -----------------------------
# Fallback landmarks RetinaFace
# -----------------------------

def _calculate_angle_from_landmarks(image_rgb, region, left_eye, right_eye):
    face_cx = region["x"] + region["w"] / 2
    face_cy = region["y"] + region["h"] / 2
    eyes_cx = (left_eye[0] + right_eye[0]) / 2
    eyes_cy = (left_eye[1] + right_eye[1]) / 2
    yaw     = ((eyes_cx - face_cx) / (region["w"] / 2 + 1e-6)) * 45
    pitch   = ((eyes_cy - face_cy) / (region["h"] / 2 + 1e-6)) * 45
    return {"yaw": round(yaw, 2), "pitch": round(pitch, 2), "angle": _determine_angle(yaw, pitch)}


def _calculate_angle_from_region(image_rgb, region):
    img_w = image_rgb.shape[1]
    img_h = image_rgb.shape[0]
    cx    = region["x"] + region["w"] / 2
    cy    = region["y"] + region["h"] / 2
    yaw   = ((cx / img_w) - 0.5) * 100
    pitch = ((cy / img_h) - 0.45) * 100
    return {"yaw": round(yaw, 2), "pitch": round(pitch, 2), "angle": _determine_angle(yaw, pitch)}


# -----------------------------
# Génération embedding ArcFace
# -----------------------------

def generate_encoding_for_angle(image_bytes: bytes) -> np.ndarray:
    image_pil = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    image_rgb = np.array(image_pil, dtype=np.uint8)

    try:
        result    = DeepFace.represent(
            img_path=image_rgb,
            model_name="ArcFace",
            detector_backend="retinaface",
            enforce_detection=True
        )
        embedding = np.array(result[0]["embedding"], dtype=np.float64)
        embedding = embedding / np.linalg.norm(embedding)
        print(f"✅ ArcFace embedding généré : {len(embedding)} dimensions")
        return embedding
    except Exception as e:
        raise Exception(f"Erreur génération encoding ArcFace : {str(e)}")


# -----------------------------
# Calcul embedding final
# -----------------------------

def compute_final_encoding(encodings_list: list) -> bytes:
    encodings_array = np.array(encodings_list)
    final_encoding  = np.mean(encodings_array, axis=0)
    final_encoding  = final_encoding / np.linalg.norm(final_encoding)
    print(f"✅ Encoding final : moyenne de {len(encodings_list)} angles → {len(final_encoding)} floats")
    return pickle.dumps(final_encoding)


# -----------------------------
# Décodage encoding
# -----------------------------

def decode_face_encoding(encoding_bytes: bytes) -> np.ndarray:
    return pickle.loads(encoding_bytes)