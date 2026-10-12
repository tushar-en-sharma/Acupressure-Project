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
MODELS_DIR    = ROOT / "model" / "weights"
MODEL_PATH    = MODELS_DIR / "geometry_model_51pt.pkl"         # v1 — training/eval CLI default
LATEST_MODEL_PATH = MODELS_DIR / "geometry_model_v2_hybrid.pkl"  # v2 — what the web app serves

# ── Landmark layout ──────────────────────────────────────────────────────────
N_MEDIAPIPE = 21          # points 0..20  (exact, from MediaPipe)
N_TOTAL     = 64          # points 0..63  (full runtime representation)
CUSTOM_RANGE = range(21, N_TOTAL)   # 21..63 — everything the model has to place
FINGER_RANGE = range(21, 51)        # 21..50 — learned finger points (real GT exists)
PALM_RANGE   = range(51, N_TOTAL)   # 51..63 — palm-centric acupressure support
FULL_ANNOTATION_ROWS = N_MEDIAPIPE + len(FINGER_RANGE)  # 51 — rows present once an
                                                          # image has base + finger points saved

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

# ── Hand acupoint atlas: points + problems (many-to-many) ────────────────────
# MediaPipe labels the hand from the camera's point of view, so its "Left" is
# the user's RIGHT hand (mirror), and vice-versa.
#
# Two point "systems" are mixed here, always tagged so the UI/practitioner
# knows which is which — see MODEL_DIFF.md / RESEARCH_RECORD.md for why:
#   "hand_acupoint" — the point's real classical location IS on the hand
#                      (e.g. LI4 Hegu, the fingertip Jing-well points).
#   "hand_reflex"   — a hand-reflexology/microsystem correspondence point:
#                      borrows a real point's name + classical indication
#                      from elsewhere on the body (ankle/spine/abdomen/elbow)
#                      and maps it onto a hand reflex zone. This is how the
#                      project's original 5 points (Lu5/BL60/GV1/CV8/CV4)
#                      work — kept as-is, just labelled honestly now. (All 5
#                      also match Su Jok's standard correspondence map: Lu5 =
#                      elbow crease on the index "arm", BL60 = outer ankle on
#                      the middle "leg", GV1 = Su Jok's anus/coccyx point,
#                      CV8/CV4 = navel/lower abdomen on the palm.)
#   "su_jok"        — a point from Prof. Park Jae Woo's Su Jok standard
#                      correspondence system (see the Su Jok block below).
#
# Every point's location is either:
#   {"kind": "index", "index": {"Left": i, "Right": i}} — reuses an existing
#     slot in the 64-point array (raw MediaPipe 0-20, or the palm-formula
#     51-63 range) — no new geometry needed.
#   {"kind": "formula", "anchor", "parent", "along", "perp", [...]} —
#     computed directly from the 21 MediaPipe points via the same
#     bone-relative invariant-frame math _geom_point uses, for a point not
#     already in the 64-point set (currently: LI4, HT7).
#   {"kind": "blend", "weights": {joint: w, ...}} — a weighted average of
#     raw MediaPipe joints (weights sum to 1), the same convex-combination
#     idea as _palm_formula; used for Su Jok zone centres.
#
# "face" is "palm", "back", or "any" (shown whichever side faces the camera —
# used for Su Jok limb joints, which are treated from either side).
#
# DRAFT: the new points (everything tagged "hand_acupoint" below) and their
# meridian groupings are compiled from standard TCM/WHO references but have
# NOT yet been reviewed by a licensed practitioner — treat as pending expert
# audit, not as clinically verified. See RESEARCH_RECORD.md.

MERIDIANS = {
    "LU": "Lung", "LI": "Large Intestine", "HT": "Heart", "SI": "Small Intestine",
    "PC": "Pericardium", "TE": "Triple Burner",
    "BL": "Bladder", "GV": "Governing Vessel", "CV": "Conception Vessel",
}

ACU_POINTS = {
    # ── original 5: hand-reflex correspondence points (unchanged locations) ──
    "Lu5":  {"kind": "index", "index": {"Left": 32, "Right": 27}, "face": "palm",
             "system": "hand_reflex", "meridian": "LU"},
    "BL60": {"kind": "index", "index": {"Left": 37, "Right": 34}, "face": "back",
             "system": "hand_reflex", "meridian": "BL"},
    "GV1":  {"kind": "index", "index": {"Left": 59, "Right": 59}, "face": "back",
             "system": "hand_reflex", "meridian": "GV"},
    "CV8":  {"kind": "index", "index": {"Left": 62, "Right": 62}, "face": "palm",
             "system": "hand_reflex", "meridian": "CV"},
    "CV4":  {"kind": "index", "index": {"Left": 63, "Right": 63}, "face": "palm",
             "system": "hand_reflex", "meridian": "CV"},

    # ── real hand acupoints — anatomically on the hand itself ────────────────
    "LU11": {"kind": "index", "index": {"Left": 4,  "Right": 4},  "face": "back",
             "system": "hand_acupoint", "meridian": "LU"},   # Shaoshang: thumb-tip nail corner
    "LI1":  {"kind": "index", "index": {"Left": 8,  "Right": 8},  "face": "back",
             "system": "hand_acupoint", "meridian": "LI"},   # Shangyang: index-tip nail corner
    "PC9":  {"kind": "index", "index": {"Left": 12, "Right": 12}, "face": "back",
             "system": "hand_acupoint", "meridian": "PC"},   # Zhongchong: middle fingertip
    "TE1":  {"kind": "index", "index": {"Left": 16, "Right": 16}, "face": "back",
             "system": "hand_acupoint", "meridian": "TE"},   # Guanchong: ring-tip nail corner
    "SI1":  {"kind": "index", "index": {"Left": 20, "Right": 20}, "face": "back",
             "system": "hand_acupoint", "meridian": "SI"},   # Shaoze: pinky-tip ulnar nail corner
    "HT9":  {"kind": "index", "index": {"Left": 20, "Right": 20}, "face": "back",
             "system": "hand_acupoint", "meridian": "HT"},   # Shaochong: pinky-tip radial nail corner
    "PC8":  {"kind": "index", "index": {"Left": 51, "Right": 51}, "face": "palm",
             "system": "hand_acupoint", "meridian": "PC"},   # Laogong: palm centre
    "HT8":  {"kind": "index", "index": {"Left": 55, "Right": 55}, "face": "palm",
             "system": "hand_acupoint", "meridian": "HT"},   # Shaofu: hypothenar palm
    "SI3":  {"kind": "index", "index": {"Left": 57, "Right": 57}, "face": "back",
             "system": "hand_acupoint", "meridian": "SI"},   # Houxi: ulnar palm/dorsum border
             # (tagged "back" so it lands on the same hand-face as TE1 for the
             # Stiff Neck protocol below — one hand shown once, not two hands
             # in different orientations at once)

    # ── formula points: not part of the 64-point array, computed on demand ──
    "LI4": {"kind": "formula", "anchor": 2, "parent": 5, "along": 0.5, "perp": 0.12,
            "face": "back", "system": "hand_acupoint", "meridian": "LI"},
            # Hegu: dorsal web between 1st/2nd metacarpals (thumb MCP <-> index MCP bone)
    "HT7": {"kind": "formula", "anchor": 0, "parent": 9, "along": -0.03, "perp": 0.14,
            "perp_pick_toward": 17, "face": "palm",
            "system": "hand_acupoint", "meridian": "HT"},
            # Shenmen: ulnar wrist crease; perp side auto-picked toward the pinky
            # MCP (17) since mirroring flips which raw sign is anatomically ulnar
}

# ── Su Jok standard correspondence system (Prof. Park Jae Woo) ──────────────
# Source: Su Jok Academy, "Fundamentals of Su Jok therapy, Cycle 1: Standard
# correspondence systems of hands and feet", Moscow, 2000. The hand is a small
# copy of the body standing with arms down:
#   thumb              distal phalanx = head, proximal phalanx = neck
#   thenar eminence    chest (heart, lungs); rest of the palm = abdomen
#   index + little     arms;  middle + ring = legs
#   finger joints      MCP = shoulder / hip, PIP = elbow / knee,
#                      DIP = wrist / ankle
#   palm = front of the body (Yin), back of hand = back of the body (Yang).
#   Spine on the back: down the thumb (cervical, upper thoracic), then from
#   the wrist to the gap between the middle and ring knuckles (lower thoracic,
#   lumbar, sacrum; coccyx = GV1 above).
# Body side: held palm forward with fingers down, the hand is a little person
# facing forward, so its thumb side is the same body side as the hand — on the
# RIGHT hand, index = right arm, middle = right leg, ring = left leg,
# little = left arm (mirrored on the left hand). MediaPipe "Left" is the
# user's RIGHT hand here, so a right-body point uses index/middle on "Left".
#
# Joint points sit exactly on MediaPipe joints. Zone points ("blend") mark the
# centre of a correspondence zone; the weights are geometric estimates from the
# manual's figures, not measured against annotated images. A practitioner
# would search the zone around the marker for the most tender spot.
_SJ_HEAD = {3: 0.5, 4: 0.5}                    # thumb distal phalanx centre
_SJ_NECK = {2: 0.5, 3: 0.5}                    # thumb proximal phalanx centre

ACU_POINTS.update({
    "SJ Head-Front": {"kind": "blend", "weights": _SJ_HEAD, "face": "palm",
                      "system": "su_jok", "meridian": None},   # face / forehead
    "SJ Head-Back":  {"kind": "blend", "weights": _SJ_HEAD, "face": "back",
                      "system": "su_jok", "meridian": None},   # back of head
    "SJ Throat":     {"kind": "blend", "weights": _SJ_NECK, "face": "palm",
                      "system": "su_jok", "meridian": None},   # larynx / thyroid
    "SJ Neck":       {"kind": "blend", "weights": _SJ_NECK, "face": "back",
                      "system": "su_jok", "meridian": None},   # cervical spine
    "SJ Chest":      {"kind": "blend", "weights": {0: 0.25, 1: 0.35, 2: 0.15, 5: 0.25},
                      "face": "palm", "system": "su_jok", "meridian": None},  # lungs, thenar centre
    "SJ Heart":      {"kind": "blend", "weights": {0: 0.45, 1: 0.25, 5: 0.30},
                      "face": "palm", "system": "su_jok", "meridian": None},  # lower inner thenar
    "SJ Stomach":    {"kind": "blend", "weights": {0: 0.75, 9: 0.125, 13: 0.125},
                      "face": "palm", "system": "su_jok", "meridian": None},  # just above the wrist
    "SJ Intestine":  {"kind": "blend", "weights": {0: 0.45, 9: 0.275, 13: 0.275},
                      "face": "palm", "system": "su_jok", "meridian": None},  # palm centre line
    "SJ Pelvis":     {"kind": "blend", "weights": {0: 0.15, 9: 0.425, 13: 0.425},
                      "face": "palm", "system": "su_jok", "meridian": None},  # bladder / uterus
    "SJ Upper Back": {"kind": "blend", "weights": {1: 0.5, 2: 0.5}, "face": "back",
                      "system": "su_jok", "meridian": None},   # thoracic, back of 1st metacarpal
    "SJ Lower Back": {"kind": "blend", "weights": {0: 0.4, 9: 0.3, 13: 0.3}, "face": "back",
                      "system": "su_jok", "meridian": None},   # lumbar, back-of-hand centre line
})

# body joint -> (joint on the same-side hand, joint on the opposite hand)
_SJ_LIMB_JOINTS = {
    "Shoulder": (5, 17), "Elbow": (6, 18), "Wrist": (7, 19),     # index / little
    "Hip": (9, 13), "Knee": (10, 14), "Ankle": (11, 15),         # middle / ring
}
for _joint, (_same, _other) in _SJ_LIMB_JOINTS.items():
    ACU_POINTS[f"SJ Right {_joint}"] = {"kind": "index", "index": {"Left": _same, "Right": _other},
                                        "face": "any", "system": "su_jok", "meridian": None}
    ACU_POINTS[f"SJ Left {_joint}"] = {"kind": "index", "index": {"Left": _other, "Right": _same},
                                       "face": "any", "system": "su_jok", "meridian": None}
del _joint, _same, _other

PROBLEMS = {
    "Chronic Bronchitis": {
        "description": "Relieves lung congestion, breathing difficulty",
        "color": (0, 200, 255), "system": "hand_reflex",
        "protocols": [{"points": ["Lu5"]}],
    },
    "Sciatica Pain": {
        "description": "Reduces lower back, leg nerve pain",
        "color": (0, 255, 120), "system": "hand_reflex",
        "protocols": [{"points": ["BL60"]}],
    },
    "Back Stiffness": {
        "description": "Helps ease upper, mid-back tightness",
        "color": (255, 170, 0), "system": "hand_reflex",
        "protocols": [{"points": ["GV1"]}],
    },
    "Constipation": {
        "description": "Supports bowel movement, abdominal relief",
        "color": (255, 80, 80), "system": "mixed",
        "protocols": [{"points": ["CV8"]}, {"points": ["CV8", "LI4"]}],
    },
    "Headache": {
        "description": "Helps reduce head pain, pressure",
        "color": (80, 180, 255), "system": "mixed",
        "protocols": [{"points": ["CV4"]}, {"points": ["LI4"]}],
    },
    "Sore Throat": {
        "description": "Heat-clearing Jing-well points for throat pain/swelling",
        "color": (60, 220, 220), "system": "hand_acupoint",
        "protocols": [{"points": ["LU11", "LI1"]}],
    },
    "Fever / Heatstroke": {
        "description": "Classic emergency resuscitation / heat-clearing point",
        "color": (40, 40, 230), "system": "hand_acupoint",
        "protocols": [{"points": ["PC9"]}, {"points": ["PC9", "LI1"]}],
    },
    "Stiff Neck": {
        "description": "Relieves acute neck and shoulder stiffness",
        "color": (200, 120, 255), "system": "hand_acupoint",
        "protocols": [{"points": ["SI3", "TE1"]}],
    },
    "Mouth Ulcers": {
        "description": "Clears heat associated with mouth/tongue sores",
        "color": (255, 255, 120), "system": "hand_acupoint",
        "protocols": [{"points": ["PC8"]}],
    },
    "Anxiety / Palpitations": {
        "description": "Calms the mind, eases heart palpitations",
        "color": (180, 150, 255), "system": "hand_acupoint",
        "protocols": [{"points": ["PC8"]}, {"points": ["HT8"]}, {"points": ["PC8", "HT9"]}],
    },
    "Insomnia": {
        "description": "Shenmen: the classic point for calming the mind, easing insomnia",
        "color": (150, 190, 255), "system": "hand_acupoint",
        "protocols": [{"points": ["HT7"]}],
    },
    "Insufficient Lactation": {
        "description": "Traditional point for low breast-milk supply",
        "color": (150, 220, 255), "system": "hand_acupoint",
        "protocols": [{"points": ["SI1"]}],
    },

    # ── Su Jok section (shown separately in the app) ────────────────────────
    # Keys are prefixed "Su Jok: " so they never clash with the classical
    # problems above; "title" is the name the app displays. Joint pain has one
    # protocol per body side — e.g. the right knee is on the right hand's
    # middle finger or the left hand's ring finger (see the Su Jok block above).
    "Su Jok: Headache": {
        "title": "Headache",
        "description": "Thumb tip = head: front of the thumb for forehead pain, back for the back of the head",
        "color": (80, 180, 255), "system": "su_jok",
        "protocols": [{"points": ["SJ Head-Front"]}, {"points": ["SJ Head-Back"]}],
    },
    "Su Jok: Sore Throat": {
        "title": "Sore Throat",
        "description": "Lower thumb bone, palm side = throat and thyroid",
        "color": (60, 220, 220), "system": "su_jok",
        "protocols": [{"points": ["SJ Throat"]}],
    },
    "Su Jok: Neck Pain": {
        "title": "Neck Pain",
        "description": "Lower thumb bone, back side = neck (cervical spine)",
        "color": (200, 120, 255), "system": "su_jok",
        "protocols": [{"points": ["SJ Neck"]}],
    },
    "Su Jok: Cough / Bronchitis": {
        "title": "Cough / Bronchitis",
        "description": "Thumb pad of the palm (thenar) = chest and lungs",
        "color": (0, 200, 255), "system": "su_jok",
        "protocols": [{"points": ["SJ Chest"]}],
    },
    "Su Jok: Palpitations": {
        "title": "Palpitations",
        "description": "Lower inner edge of the thumb pad = heart",
        "color": (180, 150, 255), "system": "su_jok",
        "protocols": [{"points": ["SJ Heart"]}],
    },
    "Su Jok: Acidity / Indigestion": {
        "title": "Acidity / Indigestion",
        "description": "Centre of the palm close to the wrist = stomach",
        "color": (110, 230, 200), "system": "su_jok",
        "protocols": [{"points": ["SJ Stomach"]}],
    },
    "Su Jok: Constipation": {
        "title": "Constipation",
        "description": "Centre of the palm = intestines",
        "color": (255, 80, 80), "system": "su_jok",
        "protocols": [{"points": ["SJ Intestine"]}],
    },
    "Su Jok: Menstrual / Bladder Discomfort": {
        "title": "Menstrual / Bladder Discomfort",
        "description": "Palm at the base of the middle and ring fingers = pelvis",
        "color": (210, 150, 230), "system": "su_jok",
        "protocols": [{"points": ["SJ Pelvis"]}],
    },
    "Su Jok: Upper Back Pain": {
        "title": "Upper Back Pain",
        "description": "Back of the thumb's palm bone = upper back (thoracic spine)",
        "color": (255, 170, 0), "system": "su_jok",
        "protocols": [{"points": ["SJ Upper Back"]}],
    },
    "Su Jok: Lower Back Pain": {
        "title": "Lower Back Pain",
        "description": "Centre line on the back of the hand = lower back (lumbar spine)",
        "color": (60, 170, 255), "system": "su_jok",
        "protocols": [{"points": ["SJ Lower Back"]}],
    },
    "Su Jok: Shoulder Pain": {
        "title": "Shoulder Pain",
        "description": "Base knuckle of the index / little finger (the arm fingers)",
        "color": (90, 200, 160), "system": "su_jok",
        "protocols": [{"points": ["SJ Right Shoulder"]}, {"points": ["SJ Left Shoulder"]}],
    },
    "Su Jok: Elbow Pain": {
        "title": "Elbow Pain",
        "description": "Middle joint of the index / little finger",
        "color": (120, 160, 230), "system": "su_jok",
        "protocols": [{"points": ["SJ Right Elbow"]}, {"points": ["SJ Left Elbow"]}],
    },
    "Su Jok: Wrist Pain": {
        "title": "Wrist Pain",
        "description": "Joint nearest the tip of the index / little finger",
        "color": (200, 200, 90), "system": "su_jok",
        "protocols": [{"points": ["SJ Right Wrist"]}, {"points": ["SJ Left Wrist"]}],
    },
    "Su Jok: Hip Pain": {
        "title": "Hip Pain",
        "description": "Base knuckle of the middle / ring finger (the leg fingers)",
        "color": (170, 110, 200), "system": "su_jok",
        "protocols": [{"points": ["SJ Right Hip"]}, {"points": ["SJ Left Hip"]}],
    },
    "Su Jok: Knee Pain": {
        "title": "Knee Pain",
        "description": "Middle joint of the middle / ring finger",
        "color": (80, 140, 255), "system": "su_jok",
        "protocols": [{"points": ["SJ Right Knee"]}, {"points": ["SJ Left Knee"]}],
    },
    "Su Jok: Ankle Sprain": {
        "title": "Ankle Sprain",
        "description": "Joint nearest the tip of the middle / ring finger",
        "color": (160, 220, 110), "system": "su_jok",
        "protocols": [{"points": ["SJ Right Ankle"]}, {"points": ["SJ Left Ankle"]}],
    },
}


def _formula_point(pts_21: np.ndarray, pdf: dict) -> np.ndarray:
    """Place a point that isn't part of the 64-point array (see ACU_POINTS
    "formula" kind), reusing _geom_point's bone-relative math directly on the
    21 raw MediaPipe points. Some points (e.g. HT7) specify
    "perp_pick_toward": a landmark index the correct anatomical side (ulnar
    vs radial) should end up closer to — computed both ways and the nearer
    one kept, since a raw perp sign flips its anatomical meaning under
    mirroring (same reason hand_facing() branches on side)."""
    base = {"anchor": pdf["anchor"], "parent": pdf["parent"], "mean_along": pdf["along"]}
    if "perp_pick_toward" in pdf:
        a = _geom_point(pts_21, {**base, "mean_perp": pdf["perp"]})
        b = _geom_point(pts_21, {**base, "mean_perp": -pdf["perp"]})
        target = pts_21[pdf["perp_pick_toward"]]
        return a if np.linalg.norm(a - target) <= np.linalg.norm(b - target) else b
    return _geom_point(pts_21, {**base, "mean_perp": pdf["perp"]})


def _blend_point(pts_21: np.ndarray, pdf: dict) -> np.ndarray:
    """Place a "blend" point: a weighted average of raw MediaPipe joints
    (weights sum to 1), so like the palm formula it moves, scales and rotates
    with the hand."""
    return sum(w * pts_21[j] for j, w in pdf["weights"].items()).astype(np.float32)


def resolve_points(hands_dict: dict) -> dict:
    """{point_label: {"side", "coord", "system", "meridian"}} for every
    ACU_POINTS entry currently visible this frame (correct face showing or
    face "any", in
    [0,1] image bounds), across every detected hand. hands_dict is the
    {mp_side: (pts_64, facing)} shape detect_hands()/predict_64 produce."""
    found: dict = {}
    for mp_side, (pts, facing) in hands_dict.items():
        pts_21 = pts[:21]
        for label, pdf in ACU_POINTS.items():
            if pdf["face"] != "any" and facing != pdf["face"]:
                continue
            if pdf["kind"] == "index":
                idx = pdf["index"].get(mp_side)
                if idx is None:
                    continue
                x, y = pts[idx]
            elif pdf["kind"] == "blend":
                x, y = _blend_point(pts_21, pdf)
            else:
                x, y = _formula_point(pts_21, pdf)
            if not (0.0 <= x <= 1.0 and 0.0 <= y <= 1.0):
                continue
            if label not in found:  # first hand to show it wins
                found[label] = {"side": mp_side, "coord": (float(x), float(y)),
                                 "system": pdf["system"], "meridian": pdf["meridian"]}
    return found


def problem_point_set(name: str) -> set:
    """Union of every point mentioned in any protocol for one problem — the
    set to highlight/track when a user has selected that problem to solve.
    Shared by the backend's live-video overlay and the CLI simulation so
    neither hand-duplicates the walk over PROBLEMS[name]["protocols"]."""
    pdf = PROBLEMS.get(name)
    if pdf is None:
        return set()
    out: set = set()
    for protocol in pdf["protocols"]:
        out.update(protocol["points"])
    return out


def resolve_problems(active_points: dict) -> list:
    """For every PROBLEMS entry, compute completion against `active_points`
    (resolve_points()'s output): whichever protocol is closest to (or fully)
    satisfied, and whether the problem is "solved" this frame."""
    out = []
    for name, pdf in PROBLEMS.items():
        best = None
        for protocol in pdf["protocols"]:
            required = protocol["points"]
            found = [p for p in required if p in active_points]
            complete = len(found) == len(required)
            if best is None or len(found) > len(best["found_points"]):
                best = {"required_points": required, "found_points": found, "complete": complete}
            if complete:
                break
        out.append({
            "name": name, "title": pdf.get("title", name),
            "description": pdf["description"], "color": pdf["color"],
            "system": pdf["system"], "protocols": pdf["protocols"],
            "required_points": best["required_points"], "found_points": best["found_points"],
            "complete": best["complete"],
        })
    return out


def acu_point_labels() -> tuple[set[int], dict[int, str]]:
    """Derive the flat {index} set and {index: display_label} dict for every
    ACU_POINTS entry that lives in the 64-point array ("index" kind only —
    "formula" points like LI4/HT7 aren't annotatable array slots). A label
    gets an " (L)"/" (R)" suffix only when the same point lives at two
    different indices (one per mirrored hand side, e.g. Lu5); a point shared
    at one index for both sides (e.g. GV1) needs none. Two different labels
    that happen to share one index (e.g. SI1/HT9, both the pinky fingertip)
    are joined with "/". Used by annotate.py so it never hand-duplicates
    this mapping."""
    positions_by_label = {
        label: set(pdf["index"].values())
        for label, pdf in ACU_POINTS.items() if pdf["kind"] == "index"
    }
    idx: set[int] = set()
    tags_by_index: dict[int, list[str]] = {}
    for label, pdf in ACU_POINTS.items():
        if pdf["kind"] != "index":
            continue
        multi_sided = len(positions_by_label[label]) > 1
        seen_here = set()
        for mp_side, j in pdf["index"].items():
            if j in seen_here:
                continue
            seen_here.add(j)
            idx.add(j)
            tag = f"{label} ({'L' if mp_side == 'Left' else 'R'})" if multi_sided else label
            tags_by_index.setdefault(j, []).append(tag)
    return idx, {j: "/".join(tags) for j, tags in tags_by_index.items()}


CSV_COLUMNS = ["filename", "point_index", "x_norm", "y_norm", "source"]

# Sources that count as real ground truth for training/evaluation. "model_seed"
# rows are model predictions passed through an annotation session untouched —
# they must never be trained on or evaluated against (that would be circular:
# the model "predicting" its own earlier output with zero error).
TRUSTED_SOURCES = {"mediapipe", "custom", "human_verified", "ai_vision"}


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


def hand_canonical_frame(pts_21: np.ndarray):
    """Translation/rotation/scale-invariant frame for the whole hand, anchored
    on the same wrist->middle-MCP bone already used as point 0's reference
    (see MP_PARENT). Returns None if the hand is degenerate (near-zero size)."""
    origin = pts_21[0]
    ref = pts_21[9] - origin
    scale = float(np.linalg.norm(ref))
    if scale < 1e-6:
        return None
    ref_dir = (ref / scale).astype(np.float32)
    perp_dir = np.array([-ref_dir[1], ref_dir[0]], dtype=np.float32)
    return origin, ref_dir, perp_dir, scale


def to_canonical(pts: np.ndarray, frame) -> np.ndarray:
    """Map image-space point(s) into the (along, perp) canonical frame."""
    origin, ref_dir, perp_dir, scale = frame
    offset = (pts - origin) / scale
    along = offset @ ref_dir
    perp = offset @ perp_dir
    return np.stack([along, perp], axis=-1).astype(np.float32)


def from_canonical(uv: np.ndarray, frame) -> np.ndarray:
    """Inverse of to_canonical: canonical (along, perp) -> image-space point."""
    origin, ref_dir, perp_dir, scale = frame
    return (origin + scale * (uv[..., 0:1] * ref_dir + uv[..., 1:2] * perp_dir)).astype(np.float32)


def hand_features_42(pts_21: np.ndarray, frame=None) -> np.ndarray:
    """All 21 MediaPipe points expressed in the canonical frame, flattened to
    a 42-dim feature vector (along_0, perp_0, along_1, perp_1, ...). Used by
    the 'ridge' point model, which — unlike 'geometry' (one local bone per
    point) — regresses each custom point from the whole hand's shape."""
    frame = frame or hand_canonical_frame(pts_21)
    if frame is None:
        return None
    return to_canonical(pts_21, frame).reshape(-1)


def _ridge_point(pts_21: np.ndarray, pdf: dict) -> np.ndarray:
    """Place one custom point via ridge regression on the whole hand's
    canonical-frame shape (42 features), instead of a single local bone."""
    frame = hand_canonical_frame(pts_21)
    if frame is None:
        return pts_21[0].astype(np.float32)
    feats = hand_features_42(pts_21, frame)
    uv = pdf["coef"] @ feats + pdf["intercept"]
    return from_canonical(uv, frame)


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
            out[j] = _ridge_point(pts_21, pdf) if pdf.get("kind") == "ridge" else _geom_point(pts_21, pdf)
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
