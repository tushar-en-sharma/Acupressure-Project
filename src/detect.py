#!/usr/bin/env python3
"""
detect.py — Live acupressure-point detector (webcam or single image).
=====================================================================
Runs the full pipeline and shows ONLY the mapped acupressure points, with
orientation-aware activation (a palm-side point is hidden when the back of the
hand faces the camera, and vice-versa). This is the demo / simulation front-end.

Run:
    python src/detect.py                       # webcam
    python src/detect.py --camera-id 1
    python src/detect.py --image path/to.jpg   # annotate one image

Webcam keys:  q quit   s save frame
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C

DEFAULT = (255, 255, 255)


def detect_hands(bgr, hands, point_defs):
    """{ side: (pts_64, facing) } for every detected hand."""
    import mediapipe as mp  # noqa (hands already created)
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    res = hands.process(rgb)
    out = {}
    if not res.multi_hand_landmarks:
        return out
    for lm, info in zip(res.multi_hand_landmarks, res.multi_handedness):
        side = info.classification[0].label
        pts_21 = np.array([[l.x, l.y] for l in lm.landmark], np.float32)
        out[side] = (C.predict_64(pts_21, point_defs), C.hand_facing(pts_21, side))
    return out


def _overlay(canvas, x1, y1, x2, y2, colour, alpha):
    sub = canvas[max(y1, 0):y2, max(x1, 0):x2]
    if sub.size == 0:
        return
    rect = np.empty_like(sub)
    rect[:] = colour
    cv2.addWeighted(rect, alpha, sub, 1 - alpha, 0, sub)


def draw(bgr, hands_dict):
    canvas = bgr.copy()
    h, w = canvas.shape[:2]
    _overlay(canvas, 0, 0, w, 52, (15, 15, 15), 0.75)
    cv2.putText(canvas, "Acupressure Hand Detector", (18, 34),
                cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2, cv2.LINE_AA)

    if hands_dict:
        facings = {f for _, (_, f) in hands_dict.items()}
        label = " | ".join(sorted(facings)).upper()
        col = (60, 180, 80) if "palm" in facings else (80, 130, 220)
        tw = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.52, 1)[0][0]
        bx = w - tw - 30
        _overlay(canvas, bx - 8, 10, bx + tw + 8, 42, col, 0.7)
        cv2.putText(canvas, label, (bx, 32), cv2.FONT_HERSHEY_SIMPLEX,
                    0.52, (255, 255, 255), 1, cv2.LINE_AA)

    if not hands_dict:
        for i, (msg, sc, c) in enumerate([
            ("Show your hand to the camera", 0.80, (200, 200, 200)),
            ("Palm  ->  Lu5 | CV8 | CV4", 0.58, (0, 200, 255)),
            ("Back  ->  BL60 | GV1", 0.58, (80, 200, 140))]):
            tw = cv2.getTextSize(msg, cv2.FONT_HERSHEY_SIMPLEX, sc, 1)[0][0]
            cv2.putText(canvas, msg, ((w - tw) // 2, h // 2 - 30 + i * 38),
                        cv2.FONT_HERSHEY_SIMPLEX, sc, c, 1, cv2.LINE_AA)
        return canvas

    def px(pt):
        return int(pt[0] * w), int(pt[1] * h)

    active, seen = [], set()
    for side, (lm, facing) in hands_dict.items():
        for idx, (label, cond, face) in C.ACUPRESSURE.get(side, {}).items():
            if facing != face:
                continue
            pt = lm[idx]
            if not (0 <= pt[0] <= 1 and 0 <= pt[1] <= 1):
                continue
            colour = C.CONDITION_COLOURS.get(cond, DEFAULT)
            cx, cy = px(pt)
            cv2.circle(canvas, (cx, cy), 5, colour, -1, cv2.LINE_AA)
            tw, th = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.62, 2)[0]
            lx, ly = cx - tw // 2, cy - 28
            cv2.line(canvas, (cx, cy - 10), (cx, ly + th + 6), colour, 1, cv2.LINE_AA)
            _overlay(canvas, lx - 6, ly - th - 6, lx + tw + 6, ly + 6, (20, 20, 20), 0.65)
            cv2.rectangle(canvas, (lx - 6, ly - th - 6), (lx + tw + 6, ly + 6), colour, 1)
            cv2.putText(canvas, label, (lx, ly), cv2.FONT_HERSHEY_SIMPLEX,
                        0.62, colour, 2, cv2.LINE_AA)
            if (label, cond) not in seen:
                seen.add((label, cond))
                active.append((label, cond, colour))

    if active:
        CW, TH, RH = 290, 32, 72
        ch = TH + len(active) * RH + 14
        x1, y1, x2, y2 = w - CW - 12, 62, w - 12, 62 + ch
        _overlay(canvas, x1, y1, x2, y2, (18, 18, 18), 0.78)
        cv2.rectangle(canvas, (x1, y1), (x2, y2), (60, 60, 60), 1)
        cv2.putText(canvas, "Active Points", (x1 + 14, y1 + 22),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.58, (180, 180, 180), 1, cv2.LINE_AA)
        for i, (label, cond, colour) in enumerate(active):
            ry = y1 + TH + i * RH + 10
            cv2.rectangle(canvas, (x1, ry), (x1 + 4, ry + RH - 8), colour, -1)
            cv2.putText(canvas, label, (x1 + 14, ry + 20),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.70, colour, 2, cv2.LINE_AA)
            cv2.putText(canvas, cond, (x1 + 14, ry + 40),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.46, (210, 210, 210), 1, cv2.LINE_AA)
            cv2.putText(canvas, C.CONDITION_DESC.get(cond, ""), (x1 + 14, ry + 58),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.38, (130, 130, 130), 1, cv2.LINE_AA)

    _overlay(canvas, 0, h - 30, w, h, (15, 15, 15), 0.70)
    cv2.putText(canvas, "q  quit      s  save frame", (18, h - 10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.42, (120, 120, 120), 1, cv2.LINE_AA)
    return canvas


def run_camera(point_defs, camera_id=0):
    cap = cv2.VideoCapture(camera_id)
    if not cap.isOpened():
        sys.exit(f"[ERROR] Cannot open camera {camera_id}")
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    hands = C.make_hands(static=False, max_hands=2)
    print("Live detector — q quit, s save")
    n = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        n += 1
        vis = draw(frame, detect_hands(frame, hands, point_defs))
        cv2.imshow("Acupressure Points  [q quit | s save]", vis)
        k = cv2.waitKey(1) & 0xFF
        if k == ord("q"):
            break
        if k == ord("s"):
            out = f"acupressure_{n:05d}.png"
            cv2.imwrite(out, vis)
            print("saved", out)
    hands.close()
    cap.release()
    cv2.destroyAllWindows()


def run_image(path, point_defs):
    img = cv2.imread(path)
    if img is None:
        sys.exit(f"[ERROR] Cannot read {path}")
    hands = C.make_hands(static=True, max_hands=2, det_conf=0.3)
    vis = draw(img, detect_hands(img, hands, point_defs))
    hands.close()
    out = str(Path(path).with_suffix("")) + "_acupressure.jpg"
    cv2.imwrite(out, vis)
    print("saved", out)


def main():
    ap = argparse.ArgumentParser(description="Acupressure hand-point detector")
    ap.add_argument("--camera-id", type=int, default=0)
    ap.add_argument("--image")
    ap.add_argument("--model", default=str(C.MODEL_PATH))
    args = ap.parse_args()
    point_defs = C.load_point_defs(Path(args.model))
    print(f"[OK] model loaded ({len(point_defs)} learned points)")
    if args.image:
        run_image(args.image, point_defs)
    else:
        run_camera(point_defs, args.camera_id)


if __name__ == "__main__":
    main()
