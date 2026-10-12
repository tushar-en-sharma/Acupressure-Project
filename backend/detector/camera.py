"""
camera.py — acupressure point/problem resolution for the Django backend.

Hand-landmark detection now happens client-side (browser MediaPipe, see
frontend/src/handTracking.js) — this module only turns the 21 landmarks it's
handed into the 64-point geometry, then resolves active acupressure points
and problem progress. Same geometry pipeline as simulation/detect.py
(core/common.py), just without any camera or video-frame concerns.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import numpy as np

from core import common as C

ROOT = C.ROOT

# Which geometry model to load — defaults to the latest (v2 hybrid);
# ACUPRESSURE_MODEL overrides it, e.g. to compare against v1 locally.
MODEL_PATH = Path(os.environ.get("ACUPRESSURE_MODEL", str(C.LATEST_MODEL_PATH)))
POINT_DEFS = C.load_point_defs(MODEL_PATH)

# Metrics shown in the UI must describe the model actually being served.
_METRICS_FOR_MODEL = {
    "geometry_model_v2_hybrid.pkl": "metrics_v2_sameset.json",
    "geometry_model_51pt.pkl": "metrics_latest.json",
}


def bgr_to_hex(bgr) -> str:
    b, g, r = bgr
    return "#{:02x}{:02x}{:02x}".format(r, g, b)


def _point_display_color(label: str) -> tuple:
    """A point can now serve more than one problem — show it in the colour
    of whichever problem lists it first (dict order = PROBLEMS definition
    order), falling back to plain white if it isn't used by any (shouldn't
    happen, but keeps this crash-free if the atlas is edited)."""
    for pdf in C.PROBLEMS.values():
        for protocol in pdf["protocols"]:
            if label in protocol["points"]:
                return pdf["color"]
    return (255, 255, 255)


POINT_COLORS = {label: _point_display_color(label) for label in C.ACU_POINTS}


def _point_catalog() -> list[dict]:
    """Static catalog of every acupressure point for the UI: label, which
    system it belongs to (real hand acupoint vs. hand-reflex correspondence),
    meridian, required hand face, and display colour."""
    return [
        {
            "label": label,
            "system": pdf["system"],
            "meridian": pdf["meridian"],
            "meridian_name": C.MERIDIANS.get(pdf["meridian"], pdf["meridian"]),
            "face": pdf["face"],
            "color": bgr_to_hex(POINT_COLORS[label]),
        }
        for label, pdf in C.ACU_POINTS.items()
    ]


def _problem_catalog() -> list[dict]:
    """Static catalog of every problem for the UI: name, description, colour,
    system, and its solution protocol(s) — one or more point sets, each
    either a single point or a multi-point "all required together" set."""
    return [
        {
            "name": name,
            "title": pdf.get("title", name),
            "description": pdf["description"],
            "color": bgr_to_hex(pdf["color"]),
            "system": pdf["system"],
            "protocols": pdf["protocols"],
        }
        for name, pdf in C.PROBLEMS.items()
    ]


def _baseline_metrics() -> dict:
    preferred = _METRICS_FOR_MODEL.get(MODEL_PATH.name)
    candidates = [preferred] if preferred else []
    for name in candidates + ["metrics_latest.json", "metrics_baseline_64pt.json"]:
        path = ROOT / "docs" / name
        if path.exists():
            try:
                overall = json.loads(path.read_text())["overall"]
                return {
                    "mae_norm": round(overall["mae_norm"], 4),
                    "pck10": round(overall["pck"]["10%"], 1),
                    "fps": round(overall["fps"], 1),
                }
            except Exception:
                continue
    return {"mae_norm": None, "pck10": None, "fps": None}


# A tidy open hand for the problem reference diagrams: the user's RIGHT hand
# with its palm to the camera, in MediaPipe-normalised image coordinates
# (fingers up, thumb on the image's right). Mirroring x gives the other three
# views, and every view is drawn the way the person sees their own hand —
# the same layout as the original hand-drawn reference sheets.
REFERENCE_HAND_21 = np.array([
    [0.500, 0.950],                                                  # 0 wrist
    [0.620, 0.880], [0.720, 0.780], [0.790, 0.690], [0.850, 0.610],  # thumb
    [0.620, 0.550], [0.645, 0.410], [0.660, 0.320], [0.670, 0.240],  # index
    [0.520, 0.530], [0.525, 0.370], [0.530, 0.270], [0.530, 0.180],  # middle
    [0.420, 0.550], [0.410, 0.410], [0.400, 0.320], [0.395, 0.240],  # ring
    [0.330, 0.600], [0.310, 0.500], [0.295, 0.430], [0.285, 0.370],  # little
], dtype=np.float32)


def _reference_views() -> list[dict]:
    """The four panels every problem diagram is drawn from — left hand
    back/palm, right hand back/palm — with every acupressure point placed by
    the same predict_64 + resolve_points code the live tracker runs, so the
    picture always matches where the camera will mark the point."""
    mirrored = REFERENCE_HAND_21.copy()
    mirrored[:, 0] = 1.0 - mirrored[:, 0]
    views = []
    # user's hand -> MediaPipe label ("Left" is the user's right hand)
    for hand, mp_side in (("Left", "Right"), ("Right", "Left")):
        for layout in (REFERENCE_HAND_21, mirrored):
            facing = C.hand_facing(layout, mp_side)
            pts_64 = C.predict_64(layout, POINT_DEFS)
            points = C.resolve_points({mp_side: (pts_64, facing)})
            views.append({
                "hand": hand,
                "face": facing,
                "landmarks": np.round(layout, 4).tolist(),
                "points": {label: [round(float(v), 4) for v in info["coord"]]
                           for label, info in points.items()},
            })
    views.sort(key=lambda v: (v["hand"] != "Left", v["face"] != "back"))
    return views


POINT_CATALOG = _point_catalog()
PROBLEM_CATALOG = _problem_catalog()
BASELINE_METRICS = _baseline_metrics()
REFERENCE_VIEWS = _reference_views()


def hands_from_landmarks(hands_in: list) -> dict:
    """Turn the browser's per-hand 21-landmark payload into the
    {side: (pts_64, facing)} shape predict_64/resolve_points expect.
    Silently skips malformed entries — a dropped frame from the client
    isn't worth a 400."""
    hands_dict = {}
    for hand in hands_in or []:
        side = hand.get("side")
        landmarks = hand.get("landmarks")
        if side not in ("Left", "Right") or not landmarks or len(landmarks) != 21:
            continue
        pts_21 = np.array(landmarks, dtype=np.float32)
        pts_64 = C.predict_64(pts_21, POINT_DEFS)
        facing = C.hand_facing(pts_21, side)
        hands_dict[side] = (pts_64, facing)
    return hands_dict


def build_state(hands_dict) -> dict:
    """Per-request state for the API: which hands are visible, which
    individual points are currently active (with their image-space
    coordinates, so the browser can draw the overlay itself), and — the part
    that actually answers "is this problem solved" — every problem's
    progress against its best-matching protocol (single- or multi-point)."""
    hands = [{"side": side, "facing": facing} for side, (_, facing) in hands_dict.items()]
    active_points = C.resolve_points(hands_dict)
    points_out = [
        {
            "label": label,
            "side": info["side"],
            "system": info["system"],
            "meridian": info["meridian"],
            "coord": list(info["coord"]),
            "color": bgr_to_hex(POINT_COLORS.get(label, (255, 255, 255))),
        }
        for label, info in active_points.items()
    ]
    problems_out = [
        {**p, "color": bgr_to_hex(p["color"])}
        for p in C.resolve_problems(active_points)
    ]
    return {"hands": hands, "active_points": points_out, "problems": problems_out}
