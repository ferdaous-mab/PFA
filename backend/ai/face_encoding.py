import os
import io
import zlib
import struct
import cv2
import numpy as np
import urllib.request
from PIL import Image
from deepface import DeepFace
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

# ─── Dossier images visage ────────────────────────────────────────────────────
FACES_DIR = os.path.join(os.path.dirname(__file__), "..", "static", "faces")
os.makedirs(FACES_DIR, exist_ok=True)

# ─── Instructions simplifiées pour l'utilisateur ─────────────────────────────
ANGLE_INSTRUCTIONS = {
    "face":        "Regardez droit devant",
    "gauche":      "Tournez lentement à gauche",
    "droite":      "Tournez lentement à droite",
    "haut":        "Regardez vers le haut",
    "bas":         "Regardez vers le bas",
    "diag_gauche": "Continuez à tourner...",
    "diag_droite": "Continuez à tourner...",
}

# ─── Seuils pose ──────────────────────────────────────────────────────────────
FACE_YAW_MAX   = 12
FACE_PITCH_MAX = 12
YAW_MIN        = 18
PITCH_MIN      = 12
DIAG_YAW_MIN   = 12
DIAG_PITCH_MIN = 8

# ─── Seuils qualité (NOUVEAUX) ────────────────────────────────────────────────
SHARPNESS_THRESHOLD = 80.0   # En dessous = image floue → rejetée
IDENTITY_THRESHOLD  = 0.55   # En dessous = autre personne → rejetée

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


# ─── NOUVEAU : filtre de netteté ──────────────────────────────────────────────
def _check_sharpness(img: np.ndarray) -> float:
    """Mesure la netteté via la variance du Laplacien. Plus c'est haut = plus c'est net."""
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


# ─── NOUVEAU : vérification que c'est la même personne ───────────────────────
def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Similarity entre deux embeddings normalisés. 1.0 = même personne."""
    return float(np.dot(
        a / (np.linalg.norm(a) + 1e-8),
        b / (np.linalg.norm(b) + 1e-8)
    ))


def _estimate_pose(image_rgb: np.ndarray):
    """MediaPipe landmarks + solvePnP → (yaw, pitch) en degrés."""
    h, w   = image_rgb.shape[:2]
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


def _classify(yaw: float, pitch: float, already_captured: list = None):
    """
    Classifie intelligemment l'angle détecté.

    Priorité :
    1. Diagonales (capturées naturellement pendant les mouvements)
    2. Face
    3. Gauche / Droite
    4. Haut / Bas

    already_captured : liste des angles déjà capturés → évite les doublons
    """
    if already_captured is None:
        already_captured = []

    candidates = []

    if yaw < -DIAG_YAW_MIN and pitch < -DIAG_PITCH_MIN:
        candidates.append(("diag_gauche", abs(yaw) + abs(pitch)))
    if yaw >  DIAG_YAW_MIN and pitch < -DIAG_PITCH_MIN:
        candidates.append(("diag_droite", abs(yaw) + abs(pitch)))
    if yaw < -DIAG_YAW_MIN and pitch > DIAG_PITCH_MIN:
        candidates.append(("diag_gauche", abs(yaw) + abs(pitch)))
    if yaw >  DIAG_YAW_MIN and pitch > DIAG_PITCH_MIN:
        candidates.append(("diag_droite", abs(yaw) + abs(pitch)))

    if abs(yaw) <= FACE_YAW_MAX and abs(pitch) <= FACE_PITCH_MAX:
        candidates.append(("face", 100))

    if yaw < -YAW_MIN and abs(pitch) <= PITCH_MIN:
        candidates.append(("gauche", abs(yaw)))
    if yaw >  YAW_MIN and abs(pitch) <= PITCH_MIN:
        candidates.append(("droite", abs(yaw)))

    if pitch < -PITCH_MIN and abs(yaw) <= YAW_MIN:
        candidates.append(("haut", abs(pitch)))
    if pitch >  PITCH_MIN and abs(yaw) <= YAW_MIN:
        candidates.append(("bas", abs(pitch)))

    if not candidates:
        return None

    candidates.sort(key=lambda x: x[1], reverse=True)
    for angle, _ in candidates:
        if angle not in already_captured:
            return angle

    return None


# ─── API publique ─────────────────────────────────────────────────────────────

def detect_face_angle(
    image_bytes: bytes,
    already_captured: list = None,
    reference_embedding: np.ndarray = None,
) -> dict:
    """
    Détecte l'angle de la tête avec 2 protections qualité :
      1. Filtre netteté  → rejette les images floues
      2. Vérif identité  → rejette si ce n'est pas la même personne

    Paramètres
    ----------
    already_captured     : angles déjà validés
    reference_embedding  : embedding de la 1re capture (anti-intrusion)
                           → passez result["embedding"] du 1er appel

    Retourne
    --------
    dict avec : detected, angle, yaw, pitch, instruction,
                embedding (np.ndarray|None), rejected (str|None)
    """
    img = np.array(Image.open(io.BytesIO(image_bytes)).convert("RGB"), dtype=np.uint8)

    # ── Protection 1 : netteté ────────────────────────────────────────────
    if _check_sharpness(img) < SHARPNESS_THRESHOLD:
        return {
            "detected": False, "angle": None, "yaw": 0, "pitch": 0,
            "instruction": "Image floue, restez immobile.",
            "embedding": None, "rejected": "flou",
        }

    # ── Estimation de pose (MediaPipe) ────────────────────────────────────
    yaw, pitch = _estimate_pose(img)

    # Fallback DeepFace si MediaPipe échoue (inchangé)
    current_emb = None
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
        return {
            "detected": False, "angle": None, "yaw": 0, "pitch": 0,
            "instruction": "Aucun visage détecté.",
            "embedding": None, "rejected": "pas de visage",
        }

    # ── Protection 2 : vérification identité (ArcFace) ───────────────────
    # On calcule l'embedding seulement si nécessaire (1re capture ou vérif)
    if reference_embedding is not None:
        try:
            result = DeepFace.represent(img_path=img, model_name="ArcFace",
                                        detector_backend="retinaface", enforce_detection=True)
            emb = np.array(result[0]["embedding"], dtype=np.float64)
            current_emb = emb / (np.linalg.norm(emb) + 1e-8)
            sim = _cosine_similarity(current_emb, reference_embedding)
            if sim < IDENTITY_THRESHOLD:
                return {
                    "detected": False, "angle": None, "yaw": 0, "pitch": 0,
                    "instruction": "Visage non reconnu, veuillez rester seul.",
                    "embedding": current_emb, "rejected": f"autre personne (sim={sim:.2f})",
                }
        except Exception:
            pass

    angle = _classify(yaw, pitch, already_captured or [])
    return {
        "detected":    True,
        "angle":       angle,
        "yaw":         yaw,
        "pitch":       pitch,
        "instruction": ANGLE_INSTRUCTIONS.get(angle, "Continuez à bouger...") if angle else "Continuez à bouger...",
        "embedding":   current_emb,
        "rejected":    None,
    }


def crop_face(image_bytes: bytes, student_id: int, angle: str) -> str | None:
    """Détecte, recadre et sauvegarde le visage sur disque."""
    try:
        img  = np.array(Image.open(io.BytesIO(image_bytes)).convert("RGB"), dtype=np.uint8)
        h, w = img.shape[:2]

        # ── Protection netteté (NOUVEAU) ──────────────────────────────────
        if _check_sharpness(img) < SHARPNESS_THRESHOLD:
            print(f"⚠️ crop_face: image floue rejetée ({angle})")
            return None

        # Détection RetinaFace (inchangé)
        faces = DeepFace.extract_faces(img_path=img, detector_backend="retinaface",
                                       enforce_detection=True, align=False)
        if not faces:
            return None

        r             = faces[0]["facial_area"]
        x, y, fw, fh  = r["x"], r["y"], r["w"], r["h"]
        pad_x, pad_y  = int(fw * 0.30), int(fh * 0.30)

        x1 = max(0, x - pad_x);      y1 = max(0, y - pad_y)
        x2 = min(w, x + fw + pad_x); y2 = min(h, y + fh + pad_y)

        face_resized  = cv2.resize(img[y1:y2, x1:x2], (224, 224), interpolation=cv2.INTER_AREA)
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


def compute_final_encoding(encodings: list) -> bytes:
    """Moyenne des embeddings → BYTEA compressé ~800 bytes."""
    arr  = np.mean(np.array(encodings), axis=0).astype(np.float32)
    arr /= (np.linalg.norm(arr) + 1e-8)
    raw        = arr.tobytes()
    compressed = zlib.compress(raw, level=6)
    header     = struct.pack(">I", len(raw))
    return header + compressed


def decode_face_encoding(data: bytes) -> np.ndarray:
    """Décode un encoding stocké en DB."""
    orig_len = struct.unpack(">I", data[:4])[0]
    raw      = zlib.decompress(data[4:])
    assert len(raw) == orig_len
    return np.frombuffer(raw, dtype=np.float32).copy()