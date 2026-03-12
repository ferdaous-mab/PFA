import os
import io
import cv2
import numpy as np
import urllib.request
from PIL import Image
from deepface import DeepFace
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

# ─── Dossiers de sauvegarde ───────────────────────────────────────────────────
FACES_DIR     = os.path.join(os.path.dirname(__file__), "..", "static", "faces")
ENCODINGS_DIR = os.path.join(os.path.dirname(__file__), "..", "static", "encodings")
os.makedirs(FACES_DIR,     exist_ok=True)
os.makedirs(ENCODINGS_DIR, exist_ok=True)

# ─── Instructions par angle ───────────────────────────────────────────────────
ANGLE_INSTRUCTIONS = {
    "face":        "Regardez droit devant",
    "gauche":      "Tournez la tête à gauche",
    "droite":      "Tournez la tête à droite",
    "haut":        "Regardez vers le haut",
    "bas":         "Regardez vers le bas",
    "diag_gauche": "Tournez en haut à gauche",
    "diag_droite": "Tournez en haut à droite",
}

# ─── Seuils de détection ──────────────────────────────────────────────────────
FACE_YAW_MAX   = 10
FACE_PITCH_MAX = 10
YAW_MIN        = 20
PITCH_MIN      = 15
DIAG_YAW_MIN   = 18
DIAG_PITCH_MIN = 12

# ─── Chargement MediaPipe ─────────────────────────────────────────────────────
_MODEL_PATH = os.path.join(os.path.dirname(__file__), "face_landmarker.task")

if not os.path.exists(_MODEL_PATH):
    print("⬇️ Téléchargement du modèle MediaPipe...")
    urllib.request.urlretrieve(
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        _MODEL_PATH
    )
    print("✅ Modèle téléchargé.")

_face_landmarker = mp_vision.FaceLandmarker.create_from_options(
    mp_vision.FaceLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=_MODEL_PATH),
        output_face_blendshapes=False,
        output_facial_transformation_matrixes=False,
        num_faces=1,
    )
)

# ─── Points 3D modèle visage (solvePnP) ──────────────────────────────────────
_FACE_3D = np.array([
    [  0.0,    0.0,    0.0 ],
    [  0.0,  -63.6,  -12.5 ],
    [-43.3,   32.7,  -26.0 ],
    [ 43.3,   32.7,  -26.0 ],
    [-28.9,  -28.9,  -24.1 ],
    [ 28.9,  -28.9,  -24.1 ],
], dtype=np.float64)
_LM_IDS = [1, 152, 263, 33, 287, 57]


def _estimate_pose(image_rgb: np.ndarray):
    """MediaPipe landmarks + solvePnP → (yaw, pitch) en degrés."""
    h, w  = image_rgb.shape[:2]
    result = _face_landmarker.detect(
        mp.Image(image_format=mp.ImageFormat.SRGB, data=image_rgb)
    )
    if not result.face_landmarks:
        return None, None

    lm    = result.face_landmarks[0]
    pts2d = np.array([[lm[i].x * w, lm[i].y * h] for i in _LM_IDS], dtype=np.float64)
    cam   = np.array([[w, 0, w/2], [0, w, h/2], [0, 0, 1]], dtype=np.float64)

    ok, rvec, _ = cv2.solvePnP(_FACE_3D, pts2d, cam, np.zeros((4, 1)),
                                flags=cv2.SOLVEPNP_ITERATIVE)
    if not ok:
        return None, None

    rmat, _ = cv2.Rodrigues(rvec)
    sy    = np.sqrt(rmat[0, 0]**2 + rmat[1, 0]**2)
    pitch = -np.degrees(np.arctan2(rmat[2, 1], rmat[2, 2]))
    yaw   = -np.degrees(np.arctan2(-rmat[2, 0], sy))
    return round(float(yaw), 2), round(float(pitch), 2)


def _classify(yaw: float, pitch: float):
    if yaw < -DIAG_YAW_MIN and pitch < -DIAG_PITCH_MIN:
        return "diag_gauche"
    if yaw >  DIAG_YAW_MIN and pitch < -DIAG_PITCH_MIN:
        return "diag_droite"
    if abs(yaw) <= FACE_YAW_MAX and abs(pitch) <= FACE_PITCH_MAX:
        return "face"
    if yaw < -YAW_MIN:
        return "gauche"
    if yaw >  YAW_MIN:
        return "droite"
    if pitch < -PITCH_MIN:
        return "haut"
    if pitch >  PITCH_MIN:
        return "bas"
    return None


# ─── API publique ─────────────────────────────────────────────────────────────

def detect_face_angle(image_bytes: bytes) -> dict:
    """Détecte l'angle de la tête depuis une image JPEG."""
    img = np.array(Image.open(io.BytesIO(image_bytes)).convert("RGB"), dtype=np.uint8)
    yaw, pitch = _estimate_pose(img)

    if yaw is None:
        try:
            faces = DeepFace.extract_faces(img_path=img, detector_backend="retinaface",
                                           enforce_detection=True, align=False)
            r  = faces[0]["facial_area"]
            le = faces[0].get("left_eye")
            re = faces[0].get("right_eye")
            if le and re:
                cx    = (le[0] + re[0]) / 2
                cy    = (le[1] + re[1]) / 2
                yaw   = round(((cx - (r["x"] + r["w"]/2)) / (r["w"]/2 + 1e-6)) * 50, 2)
                pitch = round(((cy - (r["y"] + r["h"]/2)) / (r["h"]/2 + 1e-6)) * 50, 2)
        except Exception:
            pass

    if yaw is None:
        return {"detected": False, "angle": None, "yaw": 0, "pitch": 0,
                "instruction": "Aucun visage détecté."}

    angle = _classify(yaw, pitch)
    return {
        "detected":    True,
        "angle":       angle,
        "yaw":         yaw,
        "pitch":       pitch,
        "instruction": ANGLE_INSTRUCTIONS.get(angle, "Bougez davantage") if angle else "Bougez davantage",
    }


def crop_face(image_bytes: bytes, student_id: int, angle: str) -> str | None:
    """
    Détecte, recadre et sauvegarde le visage sur disque.
    Retourne le chemin relatif ex: 'static/faces/1_face.jpg'
    """
    try:
        img  = np.array(Image.open(io.BytesIO(image_bytes)).convert("RGB"), dtype=np.uint8)
        h, w = img.shape[:2]

        faces = DeepFace.extract_faces(img_path=img, detector_backend="retinaface",
                                       enforce_detection=True, align=False)
        if not faces:
            return None

        r             = faces[0]["facial_area"]
        x, y, fw, fh = r["x"], r["y"], r["w"], r["h"]
        pad_x, pad_y  = int(fw * 0.30), int(fh * 0.30)

        x1 = max(0, x - pad_x);  y1 = max(0, y - pad_y)
        x2 = min(w, x + fw + pad_x); y2 = min(h, y + fh + pad_y)

        face_resized = cv2.resize(img[y1:y2, x1:x2], (224, 224), interpolation=cv2.INTER_AREA)

        filename      = f"{student_id}_{angle}.jpg"
        absolute_path = os.path.join(FACES_DIR, filename)
        relative_path = f"static/faces/{filename}"

        Image.fromarray(face_resized).save(absolute_path, format="JPEG", quality=90)
        print(f"📸 Image sauvegardée : {relative_path}")
        return relative_path

    except Exception as e:
        print(f"⚠️ crop_face erreur ({angle}): {e}")
        return None


def generate_encoding_for_angle(image_bytes: bytes) -> np.ndarray:
    """Génère un embedding ArcFace 512D normalisé."""
    img    = np.array(Image.open(io.BytesIO(image_bytes)).convert("RGB"), dtype=np.uint8)
    result = DeepFace.represent(img_path=img, model_name="ArcFace",
                                detector_backend="retinaface", enforce_detection=True)
    emb = np.array(result[0]["embedding"], dtype=np.float64)
    return emb / (np.linalg.norm(emb) + 1e-8)


def compute_final_encoding(encodings: list, student_id: int) -> str:
    """
    Moyenne des embeddings → sauvegarde fichier .npy sur disque.
    Retourne le chemin relatif ex: 'static/encodings/1_encoding.npy'
    """
    arr  = np.mean(np.array(encodings), axis=0)
    arr /= (np.linalg.norm(arr) + 1e-8)

    filename      = f"{student_id}_encoding.npy"
    absolute_path = os.path.join(ENCODINGS_DIR, filename)
    relative_path = f"static/encodings/{filename}"

    np.save(absolute_path, arr)
    print(f"💾 Encoding sauvegardé : {relative_path}")
    return relative_path


def decode_face_encoding(encoding_path: str) -> np.ndarray:
    """
    Charge un encoding depuis son chemin .npy.
    encoding_path : 'static/encodings/1_encoding.npy'
    """
    base_dir      = os.path.join(os.path.dirname(__file__), "..")
    absolute_path = os.path.join(base_dir, encoding_path)
    return np.load(absolute_path)