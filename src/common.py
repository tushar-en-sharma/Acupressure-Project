#!/usr/bin/env python3
"""
common.py — shared geometry, model I/O and constants for the
Acupressure Hand-Point system.

Every script in src/ imports from here so that the annotator, trainer,
evaluator and live detector all use *identical* maths. This is what keeps
"what you annotate" == "what the model predicts" == "what is evaluated".

Pipeline in one line:
    RGB frame -> MediaPipe 21 keypoints -> learned geometry model -> 64 points
                 -> orientation (palm/back) -> 5 mapped acupressure points.

Coordinate convention: every point is stored image-normalised, i.e. x,y in
[0,1] where (0,0) is top-left and (1,1) is bottom-right. This is resolution
independent, which is why the geometry model transfers across image sizes.
"""

from __future__ import annotations

import pickle
from pathlib import Path

import numpy as np

# ── Project paths (everything is relative to the repo root) ──────────────────
ROOT          = Path(__file__).resolve().parent.parent
DATASET_DIR   = ROOT / "dataset"
IMAGES_DIR    = DATASET_DIR / "Hands"
HAND_INFO_CSV = DATASET_DIR / "HandInfo.csv"
ANNOT_DIR     = ROOT / "annotations"
GT_CSV        = ANNOT_DIR / "ground_truth_64pt.csv"
MODELS_DIR    = ROOT / "models"
MODEL_PATH    = MODELS_DIR / "geometry_model_51pt.pkl"

# ── Landmark layout ──────────────────────────────────────────────────────────
N_MEDIAPIPE = 21          # points 0..20  (exact, from MediaPipe)
N_TOTAL     = 64          # points 0..63  (full runtime representation)
CUSTOM_RANGE = range(21, N_TOTAL)   # 21..63 — everything the model has to place
PALM_RANGE   = range(51, N_TOTAL)   # 51..63 — palm-centric acupressure support

# MediaPipe hand topology: each landmark's parent *towards the wrist*.
# The wrist (0) has no parent towards itself, so we point it at the middle-MCP
# (9); the bone 0->9 is the stable "down the palm" reference direction.
MP_PARENT = {
    0: 9,
    1: 0, 2: 1, 3: 2, 4: 3,          # thumb
    5: 0, 6: 5, 7: 6, 8: 7,          # index
    9: 0, 10: 9, 11: 10, 12: 11,     # middle
    13: 0, 14: 13, 15: 14, 16: 15,   # ring
    17: 0, 18: 17, 19: 18, 20: 19,   # pinky
}

# ── The 5 acupressure points (the clinical payload of the project) ───────────
# MediaPipe labels the hand from the camera's point of view, so its "Left"
# is the user's RIGHT hand (mirror), and vice-versa.
# Format: { mp_side: { point_index: (label, condition, required_face) } }
ACUPRESSURE = {
    "Left": {   # = user's RIGHT hand
        32: ("Lu5",  "Chronic Bronchitis", "palm"),
        37: ("BL60", "Sciatica Pain",      "back"),
        59: ("GV1",  "Back Stiffness",     "back"),
        62: ("CV8",  "Constipation",       "palm"),
        63: ("CV4",  "Headache",           "palm"),
    },
    "Right": {  # = user's LEFT hand
        27: ("Lu5",  "Chronic Bronchitis", "palm"),
        34: ("BL60", "Sciatica Pain",      "back"),
        59: ("GV1",  "Back Stiffness",     "back"),
        62: ("CV8",  "Constipation",       "palm"),
        63: ("CV4",  "Headache",           "palm"),
    },
}

CONDITION_COLOURS = {   # BGR for OpenCV
    "Chronic Bronchitis": (0, 200, 255),
    "Sciatica Pain":      (0, 255, 120),
    "Back Stiffness":     (255, 170, 0),
    "Constipation":       (255, 80, 80),
    "Headache":           (80, 180, 255),
}
CONDITION_DESC = {
    "Chronic Bronchitis": "Relieves lung congestion, breathing difficulty",
    "Sciatica Pain":      "Reduces lower back, leg nerve pain",
    "Back Stiffness":     "Helps ease upper, mid-back tightness",
    "Constipation":       "Supports bowel movement, abdominal relief",
    "Headache":           "Helps reduce head pain, pressure",
}

CSV_COLUMNS = ["filename", "point_index", "x_norm", "y_norm", "source"]


# ── Model I/O ────────────────────────────────────────────────────────────────
def load_point_defs(path: Path = MODEL_PATH) -> dict:
    """Load the geometry model and return its {index: point_def} mapping."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Model not found: {path}")
    with open(path, "rb") as f:
        bundle = pickle.load(f)
    if "point_defs" not in bundle:
        raise ValueError(f"Unexpected model format in {path}: missing 'point_defs'")
    # keys may load as str from some pickles — normalise to int
    return {int(k): v for k, v in bundle["point_defs"].items()}


def save_point_defs(point_defs: dict, path: Path = MODEL_PATH, source: str = "GT_geometry"):
    """Persist a geometry model in the exact format the runtime expects."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    bundle = {
        "point_defs": {int(k): v for k, v in point_defs.items()},
        "n_pts": len(point_defs),
        "source": source,
    }
    with open(path, "wb") as f:
        pickle.dump(bundle, f)


# ── Geometry reconstruction ──────────────────────────────────────────────────
def _geom_point(pts_21: np.ndarray, pdf: dict) -> np.ndarray:
    """Place one custom point from a bone + (perp, along) coefficients."""
    a, p = pdf["anchor"], pdf["parent"]
    bone = pts_21[a] - pts_21[p]
    blen = float(np.linalg.norm(bone))
    if blen < 1e-6:
        return pts_21[a].astype(np.float32)
    bone_n = (bone / blen).astype(np.float32)
    perp   = np.array([-bone_n[1], bone_n[0]], dtype=np.float32)
    return (pts_21[a]
            + pdf["mean_perp"]  * blen * perp
            + pdf["mean_along"] * blen * bone_n).astype(np.float32)


def decompose(pts_21: np.ndarray, target: np.ndarray, anchor: int, parent: int):
    """Inverse of _geom_point: given a target point, return (perp, along)
    coefficients relative to the anchor->parent bone. Used by the trainer."""
    bone = pts_21[anchor] - pts_21[parent]
    blen = float(np.linalg.norm(bone))
    if blen < 1e-6:
        return 0.0, 0.0
    bone_n = bone / blen
    perp   = np.array([-bone_n[1], bone_n[0]], dtype=np.float32)
    offset = (target - pts_21[anchor]) / blen
    return float(np.dot(offset, perp)), float(np.dot(offset, bone_n))


def _palm_formula(pts: np.ndarray) -> np.ndarray:
    """The 13 fallback palm points (indices 51..63) used when a point has no
    learned definition yet. Purely geometric, so it always produces something
    sensible even before any palm annotation exists."""
    w, i, m, r, p = pts[0], pts[5], pts[9], pts[13], pts[17]
    top_row = (i + m + r + p) / 4.0
    center  = (w + i + m + r + p) / 5.0
    extras = np.array([
        center,                          # 51 palm center
        top_row,                         # 52 upper palm center
        0.58 * w + 0.42 * top_row,       # 53 lower palm center
        0.25 * w + 0.55 * i + 0.20 * m,  # 54 thenar-like region
        0.25 * w + 0.55 * p + 0.20 * r,  # 55 hypothenar-like region
        0.60 * i + 0.40 * m,             # 56 radial mid ridge
        0.60 * p + 0.40 * r,             # 57 ulnar mid ridge
        0.50 * i + 0.50 * p,             # 58 proximal transverse center
        0.50 * m + 0.50 * r,             # 59 distal transverse center
        0.55 * w + 0.45 * i,             # 60 lower radial palm
        0.55 * w + 0.45 * p,             # 61 lower ulnar palm
    ], dtype=np.float32)
    p62 = 0.5 * (extras[0] + extras[3])                 # 62 constipation
    side_sign = np.sign(extras[4][0] - extras[3][0])
    p62[0] += 0.018 * side_sign
    p62[1] += 0.026
    p63 = extras[7].copy()                              # 63 headache
    p63[1] += 0.016
    return np.clip(np.vstack([extras, p62, p63]), 0.0, 1.0)


def predict_64(pts_21: np.ndarray, point_defs: dict) -> np.ndarray:
    """Full 64-point prediction for a single hand.

    Points 0..20  : MediaPipe (verbatim).
    Points 21..63 : learned geometry where a definition exists,
                    otherwise the palm formula fallback (51..63 only).
    """
    out = np.zeros((N_TOTAL, 2), dtype=np.float32)
    out[:21] = pts_21
    defined = set()
    for j, pdf in point_defs.items():
        if 21 <= j < N_TOTAL:
            out[j] = _geom_point(pts_21, pdf)
            defined.add(j)
    # Fill any palm point (51..63) that has no learned definition yet.
    palm = _palm_formula(out)
    for k, j in enumerate(range(51, N_TOTAL)):
        if j not in defined:
            out[j] = palm[k]
    return out


# ── Orientation ──────────────────────────────────────────────────────────────
def hand_facing(pts_21: np.ndarray, side: str) -> str:
    """'palm' or 'back' from the sign of (wrist->index)x(wrist->pinky)."""
    v_index = pts_21[5]  - pts_21[0]
    v_pinky = pts_21[17] - pts_21[0]
    cross_z = float(v_index[0] * v_pinky[1] - v_index[1] * v_pinky[0])
    if side == "Right":
        return "palm" if cross_z > 0 else "back"
    return "palm" if cross_z < 0 else "back"


# ── MediaPipe helper ─────────────────────────────────────────────────────────
def make_hands(static: bool = True, max_hands: int = 1, det_conf: float = 0.5,
               track_conf: float = 0.5):
    import mediapipe as mp
    return mp.solutions.hands.Hands(
        static_image_mode=static,
        max_num_hands=max_hands,
        min_detection_confidence=det_conf,
        min_tracking_confidence=track_conf,
    )


def mediapipe_21(bgr, hands):
    """Return (pts_21, side) for the first detected hand, or (None, None)."""
    import cv2
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    res = hands.process(rgb)
    if not res.multi_hand_landmarks:
        return None, None
    lm = res.multi_hand_landmarks[0].landmark
    pts = np.array([[l.x, l.y] for l in lm], dtype=np.float32)
    side = res.multi_handedness[0].classification[0].label if res.multi_handedness else "Right"
    return pts, side
