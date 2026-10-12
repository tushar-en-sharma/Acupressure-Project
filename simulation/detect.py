#!/usr/bin/env python3
"""
detect.py — Live acupressure-point detector (webcam or single image).
=====================================================================
Runs the full pipeline and shows ONLY the mapped acupressure points, with
orientation-aware activation (a palm-side point is hidden when the back of the
hand faces the camera, and vice-versa). This is the demo / simulation front-end.

Run:
    python simulation/detect.py                # webcam
    python simulation/detect.py --camera-id 1
    python simulation/detect.py --image path/to.jpg  # annotate one image
    python simulation/detect.py --model model/weights/geometry_model_v2_hybrid.pkl
    python simulation/detect.py --image path/to.jpg --all-points  # all 64 points + bone lines, no webcam
    python simulation/detect.py --all-points                      # same, live on webcam

Webcam keys:  q quit   s save frame
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from core import common as C

DEFAULT = (255, 255, 255)

MP_EDGES = [  # standard MediaPipe hand skeleton, for drawing bone lines
    (0, 1), (1, 2), (2, 3), (3, 4),          # thumb
    (0, 5), (5, 6), (6, 7), (7, 8),          # index
    (0, 9), (9, 10), (10, 11), (11, 12),     # middle
    (0, 13), (13, 14), (14, 15), (15, 16),   # ring
    (0, 17), (17, 18), (18, 19), (19, 20),   # pinky
    (5, 9), (9, 13), (13, 17),               # palm base row
]
COL_BASE, COL_CUSTOM, COL_PALM, COL_ACU = (140, 140, 140), (255, 210, 20), (0, 165, 255), (200, 0, 255)


def draw_all_points(bgr, pts_64, side, facing):
    """Debug view: every one of the 64 model points + MediaPipe bone lines —
    no acupressure filtering, no live-camera framing. For --all-points."""
    canvas = bgr.copy()
    h, w = canvas.shape[:2]

    def px(j):
        return int(pts_64[j][0] * w), int(pts_64[j][1] * h)

    for a, b in MP_EDGES:
        cv2.line(canvas, px(a), px(b), (90, 90, 90), 1, cv2.LINE_AA)

    acu_idx, _ = C.acu_point_labels()
    for j in range(C.N_TOTAL):
        x, y = px(j)
        if j < C.N_MEDIAPIPE:
            col, r = COL_BASE, 3
        elif j in acu_idx:
            col, r = COL_ACU, 6
        elif j in C.FINGER_RANGE:
            col, r = COL_CUSTOM, 4
        else:
            col, r = COL_PALM, 5
        cv2.circle(canvas, (x, y), r, col, -1, cv2.LINE_AA)
        if j in acu_idx or j in C.PALM_RANGE:
            cv2.putText(canvas, str(j), (x + 7, y - 7), cv2.FONT_HERSHEY_SIMPLEX,
                        0.42, col, 1, cv2.LINE_AA)

    _overlay(canvas, 0, 0, w, 34, (15, 15, 15), 0.7)
    cv2.putText(canvas, f"{side} hand - {facing.upper()}  |  grey=MediaPipe(0-20)  "
                         f"yellow=finger(21-50)  orange=palm(51-63)  pink=acupressure",
                (10, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 255, 255), 1, cv2.LINE_AA)
    return canvas


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


def draw(bgr, hands_dict, focus_problem=None):
    """focus_problem: optional problem name (must be a key in C.PROBLEMS) —
    when set, only that problem's candidate points are drawn/tracked and a
    progress readout ("2/2 found - SOLVED") replaces the full points list."""
    canvas = bgr.copy()
    h, w = canvas.shape[:2]
    _overlay(canvas, 0, 0, w, 52, (15, 15, 15), 0.75)
    title = f"Solving: {focus_problem}" if focus_problem else "Acupressure Hand Detector"
    cv2.putText(canvas, title, (18, 34),
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
        msg = "Show your hand to the camera"
        tw = cv2.getTextSize(msg, cv2.FONT_HERSHEY_SIMPLEX, 0.80, 1)[0][0]
        cv2.putText(canvas, msg, ((w - tw) // 2, h // 2), cv2.FONT_HERSHEY_SIMPLEX,
                    0.80, (200, 200, 200), 1, cv2.LINE_AA)
        return canvas

    def px(pt):
        return int(pt[0] * w), int(pt[1] * h)

    active_points = C.resolve_points(hands_dict)
    wanted = C.problem_point_set(focus_problem) if focus_problem else None

    active = []
    for label, info in active_points.items():
        if wanted is not None and label not in wanted:
            continue
        # Su Jok's many joint/zone points would bury the classical ones —
        # draw them only when a Su Jok problem is in focus (--problem).
        if wanted is None and info["system"] == "su_jok":
            continue
        colour = point_colour(label)
        cx, cy = px(info["coord"])
        cv2.circle(canvas, (cx, cy), 5, colour, -1, cv2.LINE_AA)
        tw, th = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.62, 2)[0]
        lx, ly = cx - tw // 2, cy - 28
        cv2.line(canvas, (cx, cy - 10), (cx, ly + th + 6), colour, 1, cv2.LINE_AA)
        _overlay(canvas, lx - 6, ly - th - 6, lx + tw + 6, ly + 6, (20, 20, 20), 0.65)
        cv2.rectangle(canvas, (lx - 6, ly - th - 6), (lx + tw + 6, ly + 6), colour, 1)
        cv2.putText(canvas, label, (lx, ly), cv2.FONT_HERSHEY_SIMPLEX,
                    0.62, colour, 2, cv2.LINE_AA)
        active.append((label, colour))

    if focus_problem:
        _draw_problem_progress(canvas, w, focus_problem, active_points)
    elif active:
        _draw_active_points_panel(canvas, w, active)

    _overlay(canvas, 0, h - 30, w, h, (15, 15, 15), 0.70)
    cv2.putText(canvas, "q  quit      s  save frame", (18, h - 10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.42, (120, 120, 120), 1, cv2.LINE_AA)
    return canvas


def point_colour(label):
    for pdf in C.PROBLEMS.values():
        for protocol in pdf["protocols"]:
            if label in protocol["points"]:
                return pdf["color"]
    return DEFAULT


def _draw_active_points_panel(canvas, w, active):
    CW, TH, RH = 220, 32, 40
    ch = TH + len(active) * RH + 14
    x1, y1, x2, y2 = w - CW - 12, 62, w - 12, 62 + ch
    _overlay(canvas, x1, y1, x2, y2, (18, 18, 18), 0.78)
    cv2.rectangle(canvas, (x1, y1), (x2, y2), (60, 60, 60), 1)
    cv2.putText(canvas, "Active Points", (x1 + 14, y1 + 22),
                cv2.FONT_HERSHEY_SIMPLEX, 0.58, (180, 180, 180), 1, cv2.LINE_AA)
    for i, (label, colour) in enumerate(active):
        ry = y1 + TH + i * RH + 10
        cv2.rectangle(canvas, (x1, ry), (x1 + 4, ry + RH - 12), colour, -1)
        cv2.putText(canvas, label, (x1 + 14, ry + 12),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.60, colour, 2, cv2.LINE_AA)


def _draw_problem_progress(canvas, w, focus_problem, active_points):
    problems = {p["name"]: p for p in C.resolve_problems(active_points)}
    p = problems[focus_problem]
    solved = p["complete"]
    lines = [
        f"{focus_problem}  -  {'SOLVED' if solved else 'in progress'}",
        f"Points: {'+'.join(p['required_points'])}  "
        f"({len(p['found_points'])}/{len(p['required_points'])} found)",
        p["description"],
    ]
    col = (80, 220, 120) if solved else (0, 180, 255)
    CW = max(cv2.getTextSize(t, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)[0][0] for t in lines) + 28
    ch = 20 + len(lines) * 26
    x1, y1, x2, y2 = w - CW - 12, 62, w - 12, 62 + ch
    _overlay(canvas, x1, y1, x2, y2, (18, 18, 18), 0.82)
    cv2.rectangle(canvas, (x1, y1), (x2, y2), col, 2)
    for i, text in enumerate(lines):
        cv2.putText(canvas, text, (x1 + 12, y1 + 24 + i * 26),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, col if i == 0 else (200, 200, 200),
                    1, cv2.LINE_AA)


def run_camera(point_defs, camera_id=0, all_points=False, problem=None):
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
        hands_dict = detect_hands(frame, hands, point_defs)
        if all_points:
            if hands_dict:
                side, (pts_64, facing) = next(iter(hands_dict.items()))
                vis = draw_all_points(frame, pts_64, side, facing)
            else:
                vis = frame.copy()
                cv2.putText(vis, "Show your hand to the camera", (30, 40),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (200, 200, 200), 1, cv2.LINE_AA)
            win = "All 64 Points  [q quit | s save]"
        else:
            vis = draw(frame, hands_dict, focus_problem=problem)
            win = "Acupressure Points  [q quit | s save]"
        cv2.imshow(win, vis)
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


def run_image(path, point_defs, all_points=False, problem=None):
    img = cv2.imread(path)
    if img is None:
        sys.exit(f"[ERROR] Cannot read {path}")
    hands = C.make_hands(static=True, max_hands=2, det_conf=0.3)
    hands_dict = detect_hands(img, hands, point_defs)
    hands.close()

    if all_points:
        if not hands_dict:
            sys.exit("[ERROR] No hand detected in image.")
        side, (pts_64, facing) = next(iter(hands_dict.items()))
        vis = draw_all_points(img, pts_64, side, facing)
        suffix = "_all_points.jpg"
    else:
        vis = draw(img, hands_dict, focus_problem=problem)
        suffix = "_acupressure.jpg"

    out = str(Path(path).with_suffix("")) + suffix
    cv2.imwrite(out, vis)
    print("saved", out)


def main():
    ap = argparse.ArgumentParser(description="Acupressure hand-point detector")
    ap.add_argument("--camera-id", type=int, default=0)
    ap.add_argument("--image")
    ap.add_argument("--model", default=str(C.MODEL_PATH))
    ap.add_argument("--all-points", action="store_true",
                     help="show all 64 model points + bone lines instead of just the acu-points")
    ap.add_argument("--problem", choices=sorted(C.PROBLEMS.keys()), default=None,
                     help="focus on solving one problem: track only its point(s) "
                          "and show single-/multi-point completion progress")
    ap.add_argument("--list-problems", action="store_true",
                     help="print every problem name (for --problem) and exit")
    args = ap.parse_args()
    if args.list_problems:
        for name, pdf in C.PROBLEMS.items():
            protos = " | ".join("+".join(p["points"]) for p in pdf["protocols"])
            print(f"{name}  [{pdf['system']}]  ->  {protos}")
        return
    point_defs = C.load_point_defs(Path(args.model))
    print(f"[OK] model loaded ({len(point_defs)} learned points)")
    if args.image:
        run_image(args.image, point_defs, all_points=args.all_points, problem=args.problem)
    else:
        run_camera(point_defs, args.camera_id, all_points=args.all_points, problem=args.problem)


if __name__ == "__main__":
    main()
