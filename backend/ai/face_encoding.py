import numpy as np
import pickle
from PIL import Image
import io
import cv2
import torch
import torch.nn as nn
from torchvision import transforms
import timm
from deepface import DeepFace
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

# Seuils en vrais degrés
FACE_YAW_MAX   = 10
FACE_PITCH_MAX = 10
YAW_MIN        = 20
PITCH_MIN      = 15
DIAG_YAW_MIN   = 18
DIAG_PITCH_MIN = 12

# -----------------------------
# 6DRepNet Model
# -----------------------------

class SixDRepNet(nn.Module):
    """
    6DRepNet : meilleur modèle head pose estimation (2022)
    Utilise la représentation 6D de la rotation → plus stable que Euler
    """
    def __init__(self):
        super(SixDRepNet, self).__init__()
        self.backbone = timm.create_model(
            "repvgg_b1",
            pretrained=False,
            num_classes=0,         # on enlève le classifieur
            global_pool="avg"
        )
        # Couche de sortie : 6 valeurs pour représentation 6D
        self.fc = nn.Linear(self.backbone.num_features, 6)

    def forward(self, x):
        feat = self.backbone(x)
        out  = self.fc(feat)
        return out

    def compute_euler(self, x):
        """
        Retourne yaw, pitch, roll en degrés
        """
        out       = self.forward(x)
        rot_mat   = self._6d_to_rotation_matrix(out)
        euler     = self._rotation_matrix_to_euler(rot_mat)
        return euler  # [pitch, yaw, roll] en degrés

    def _6d_to_rotation_matrix(self, x):
        """
        Convertit représentation 6D → matrice rotation 3×3
        (Zhou et al. 2019 - On the Continuity of Rotation Representations)
        """
        batch = x.shape[0]
        # x shape: (batch, 6)
        a1 = x[:, :3]   # premiers 3 éléments
        a2 = x[:, 3:]   # derniers 3 éléments

        # Gram-Schmidt orthogonalisation
        b1 = nn.functional.normalize(a1, dim=1)
        dot = (b1 * a2).sum(dim=1, keepdim=True)
        b2 = nn.functional.normalize(a2 - dot * b1, dim=1)
        b3 = torch.cross(b1, b2, dim=1)

        # Matrice rotation (batch, 3, 3)
        rot = torch.stack([b1, b2, b3], dim=-1)
        return rot

    def _rotation_matrix_to_euler(self, rot):
        """
        Matrice rotation → angles Euler (pitch, yaw, roll) en degrés
        """
        batch = rot.shape[0]

        sy = torch.sqrt(rot[:, 0, 0] ** 2 + rot[:, 1, 0] ** 2)
        singular = sy < 1e-6

        pitch = torch.atan2( rot[:, 2, 1], rot[:, 2, 2])
        yaw   = torch.atan2(-rot[:, 2, 0], sy)
        roll  = torch.atan2( rot[:, 1, 0], rot[:, 0, 0])

        pitch = torch.degrees(pitch)
        yaw   = torch.degrees(yaw)
        roll  = torch.degrees(roll)

        return torch.stack([pitch, yaw, roll], dim=1)


# -----------------------------
# Chargement du modèle 6DRepNet
# -----------------------------

_DEVICE     = torch.device("cuda" if torch.cuda.is_available() else "cpu")
_MODEL_PATH = os.path.join(os.path.dirname(__file__), "6drepnet_weights.pth")
_MODEL_URL  = "https://huggingface.co/osanseviero/6DRepNet/resolve/main/model_epoch_last.tar"

def _load_6drepnet():
    """
    Charge le modèle 6DRepNet (télécharge les poids si absent)
    """
    if not os.path.exists(_MODEL_PATH):
        print("⬇️ Téléchargement des poids 6DRepNet (~170MB)...")
        urllib.request.urlretrieve(_MODEL_URL, _MODEL_PATH)
        print("✅ Poids téléchargés.")

    model = SixDRepNet().to(_DEVICE)

    checkpoint = torch.load(_MODEL_PATH, map_location=_DEVICE)

    # Gérer différents formats de checkpoint
    if "model_state_dict" in checkpoint:
        state_dict = checkpoint["model_state_dict"]
    elif "state_dict" in checkpoint:
        state_dict = checkpoint["state_dict"]
    else:
        state_dict = checkpoint

    # Nettoyer les clés si nécessaire
    new_state = {}
    for k, v in state_dict.items():
        key = k.replace("module.", "")
        new_state[key] = v

    model.load_state_dict(new_state, strict=False)
    model.eval()
    print(f"✅ 6DRepNet chargé sur {_DEVICE}")
    return model

# Transformations image pour 6DRepNet
_TRANSFORM = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225]
    )
])

# Chargement au démarrage
print("⏳ Chargement de 6DRepNet...")
try:
    _6DREPNET_MODEL = _load_6drepnet()
    _USE_6DREPNET   = True
    print("✅ 6DRepNet prêt !")
except Exception as e:
    print(f"⚠️ 6DRepNet non disponible: {e} → fallback MediaPipe")
    _USE_6DREPNET = False
    # Fallback MediaPipe
    import mediapipe as mp
    from mediapipe.tasks import python as mp_python
    from mediapipe.tasks.python import vision as mp_vision
    _MP_MODEL_PATH = os.path.join(os.path.dirname(__file__), "face_landmarker.task")
    if os.path.exists(_MP_MODEL_PATH):
        _base_options = mp_python.BaseOptions(model_asset_path=_MP_MODEL_PATH)
        _mp_options   = mp_vision.FaceLandmarkerOptions(
            base_options=_base_options,
            output_facial_transformation_matrixes=True,
            num_faces=1
        )
        _face_landmarker = mp_vision.FaceLandmarker.create_from_options(_mp_options)


# -----------------------------
# Détection visage avec OpenCV
# -----------------------------

_FACE_CASCADE = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
)

def _detect_face_roi(image_rgb: np.ndarray):
    """
    Détecte le visage et retourne la région recadrée (ROI)
    pour alimenter 6DRepNet
    """
    gray   = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2GRAY)
    faces  = _FACE_CASCADE.detectMultiScale(
        gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60)
    )

    if len(faces) == 0:
        # Retourner l'image entière si pas de visage détecté
        return image_rgb, None

    # Prendre le plus grand visage
    x, y, w, h = max(faces, key=lambda f: f[2] * f[3])

    # Agrandir légèrement la ROI
    pad = int(0.2 * min(w, h))
    x1  = max(0, x - pad)
    y1  = max(0, y - pad)
    x2  = min(image_rgb.shape[1], x + w + pad)
    y2  = min(image_rgb.shape[0], y + h + pad)

    roi = image_rgb[y1:y2, x1:x2]
    return roi, (x1, y1, x2, y2)


# -----------------------------
# ✅ Estimation pose avec 6DRepNet
# -----------------------------

def _estimate_pose_6drepnet(image_rgb: np.ndarray) -> dict | None:
    """
    6DRepNet : estimation head pose state-of-the-art
    Retourne yaw, pitch, roll en degrés
    """
    try:
        roi, bbox = _detect_face_roi(image_rgb)

        # Convertir en PIL pour les transformations
        roi_pil = Image.fromarray(roi)
        tensor  = _TRANSFORM(roi_pil).unsqueeze(0).to(_DEVICE)

        with torch.no_grad():
            euler = _6DREPNET_MODEL.compute_euler(tensor)

        pitch = float(euler[0, 0])
        yaw   = float(euler[0, 1])
        roll  = float(euler[0, 2])

        print(f"[6DRepNet] yaw={yaw:.1f}° pitch={pitch:.1f}° roll={roll:.1f}°")

        return {
            "yaw":   round(yaw,   2),
            "pitch": round(pitch, 2),
        }
    except Exception as e:
        print(f"⚠️ 6DRepNet erreur: {e}")
        return None


# -----------------------------
# Fallback MediaPipe solvePnP
# -----------------------------

_FACE_3D_MODEL = np.array([
    [  0.0,    0.0,    0.0 ],
    [  0.0,  -63.6,  -12.5],
    [-43.3,   32.7,  -26.0],
    [ 43.3,   32.7,  -26.0],
    [-28.9,  -28.9,  -24.1],
    [ 28.9,  -28.9,  -24.1],
], dtype=np.float64)
_LANDMARK_IDS = [1, 152, 263, 33, 287, 57]

def _estimate_pose_mediapipe(image_rgb: np.ndarray) -> dict | None:
    try:
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=image_rgb)
        result   = _face_landmarker.detect(mp_image)
        if not result.face_landmarks:
            return None
        h, w     = image_rgb.shape[:2]
        landmarks = result.face_landmarks[0]
        pts2d    = np.array([[landmarks[i].x * w, landmarks[i].y * h]
                              for i in _LANDMARK_IDS], dtype=np.float64)
        focal    = w
        cam_mat  = np.array([[focal,0,w/2],[0,focal,h/2],[0,0,1]], dtype=np.float64)
        dist     = np.zeros((4,1), dtype=np.float64)
        ok, rvec, tvec = cv2.solvePnP(_FACE_3D_MODEL, pts2d, cam_mat, dist,
                                       flags=cv2.SOLVEPNP_ITERATIVE)
        if not ok:
            return None
        rmat, _ = cv2.Rodrigues(rvec)
        sy      = np.sqrt(rmat[0,0]**2 + rmat[1,0]**2)
        pitch   = -np.degrees(np.arctan2(rmat[2,1], rmat[2,2]))
        yaw     = -np.degrees(np.arctan2(-rmat[2,0], sy))
        print(f"[MediaPipe fallback] yaw={yaw:.1f}° pitch={pitch:.1f}°")
        return {"yaw": round(float(yaw),2), "pitch": round(float(pitch),2)}
    except Exception as e:
        print(f"⚠️ MediaPipe fallback erreur: {e}")
        return None


# -----------------------------
# Détection angle du visage
# -----------------------------

def detect_face_angle(image_bytes: bytes) -> dict:
    image_pil = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    image_rgb = np.array(image_pil, dtype=np.uint8)

    # ✅ 6DRepNet (principal)
    pose = None
    if _USE_6DREPNET:
        pose = _estimate_pose_6drepnet(image_rgb)

    # Fallback MediaPipe
    if pose is None and not _USE_6DREPNET:
        try:
            pose = _estimate_pose_mediapipe(image_rgb)
        except Exception:
            pass

    # Fallback RetinaFace
    if pose is None:
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
                cx   = (left_eye[0] + right_eye[0]) / 2
                cy   = (left_eye[1] + right_eye[1]) / 2
                fcx  = region["x"] + region["w"] / 2
                fcy  = region["y"] + region["h"] / 2
                yaw  = ((cx - fcx) / (region["w"] / 2 + 1e-6)) * 50
                pitch= ((cy - fcy) / (region["h"] / 2 + 1e-6)) * 50
                pose = {"yaw": round(yaw,2), "pitch": round(pitch,2)}
        except Exception:
            pass

    if pose is None:
        return {
            "detected":    False,
            "angle":       None,
            "yaw":         0,
            "pitch":       0,
            "instruction": "Aucun visage détecté. Repositionnez-vous."
        }

    angle = _determine_angle(pose["yaw"], pose["pitch"])
    return {
        "detected":    True,
        "angle":       angle,
        "yaw":         pose["yaw"],
        "pitch":       pose["pitch"],
        "instruction": ANGLE_INSTRUCTIONS.get(angle, "Bougez davantage la tête") if angle else "Bougez davantage la tête"
    }


# -----------------------------
# Détermination de l'angle
# -----------------------------

def _determine_angle(yaw: float, pitch: float) -> str | None:
    if yaw < -DIAG_YAW_MIN and pitch < -DIAG_PITCH_MIN:
        return "diag_gauche"
    if yaw > DIAG_YAW_MIN and pitch < -DIAG_PITCH_MIN:
        return "diag_droite"
    if abs(yaw) <= FACE_YAW_MAX and abs(pitch) <= FACE_PITCH_MAX:
        return "face"
    if yaw < -YAW_MIN:
        return "gauche"
    if yaw > YAW_MIN:
        return "droite"
    if pitch < -PITCH_MIN:
        return "haut"
    if pitch > PITCH_MIN:
        return "bas"
    return None


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