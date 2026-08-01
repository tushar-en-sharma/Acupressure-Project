#!/usr/bin/env python3
"""
evaluate.py — Quantitative evaluation of the 64-point model.
============================================================
Computes the standard keypoint-localisation metrics on every point that has
ground truth in annotations/ground_truth_64pt.csv:

    MAE, RMSE      — mean / root-mean-square localisation error
    PCK@2/5/10%    — % of points within 2/5/10% of hand size
    FPS            — inference speed
    per-point      — best / worst points, and validity for any point w/o GT

As you annotate palm points 51-63, they automatically move from the
"no ground truth" bucket into the measured metrics — closing the evaluation
gap noted in the original report.

Run:
    python src/evaluate.py
    python src/evaluate.py --save-json docs/metrics_latest.json
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import cv2
import numpy as np
import pandas as pd

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C


def evaluate(model_path, gt_csv, img_dir, save_json=None):
    point_defs = C.load_point_defs(model_path)
    df = pd.read_csv(gt_csv)
    images = sorted(df["filename"].unique())
    hands = C.make_hands(static=True, max_hands=1, det_conf=0.3)

    errors   = {j: [] for j in range(C.N_TOTAL)}
    errors_px = {j: [] for j in range(C.N_TOTAL)}
    hand_sizes, times = [], []
    total, detected, skipped = len(images), 0, 0

    for fname in images:
        img = cv2.imread(str(Path(img_dir) / fname))
        if img is None:
            skipped += 1
            continue
        h, w = img.shape[:2]

        t0 = time.perf_counter()
        pts_21, _ = C.mediapipe_21(img, hands)
        pred = C.predict_64(pts_21, point_defs) if pts_21 is not None else None
        times.append(time.perf_counter() - t0)
        if pred is None:
            continue
        detected += 1

        sub = df[df["filename"] == fname]
        gt21 = sub[sub["point_index"].between(0, 20)][["x_norm", "y_norm"]].to_numpy(np.float32)
        if len(gt21) >= 4:
            bw = float(gt21[:, 0].max() - gt21[:, 0].min())
            bh = float(gt21[:, 1].max() - gt21[:, 1].min())
            hand_sizes.append(float(np.hypot(bw, bh)) + 1e-6)

        for j in range(C.N_TOTAL):
            row = sub[sub["point_index"] == j]
            if row.empty:
                continue
            gt = np.array([float(row.iloc[0]["x_norm"]), float(row.iloc[0]["y_norm"])], np.float32)
            errors[j].append(float(np.linalg.norm(pred[j] - gt)))
            errors_px[j].append(float(np.hypot((pred[j][0] - gt[0]) * w, (pred[j][1] - gt[1]) * h)))
    hands.close()

    labelled = [j for j in range(C.N_TOTAL) if errors[j]]
    all_e  = np.array([e for j in labelled for e in errors[j]], np.float32)
    all_px = np.array([e for j in labelled for e in errors_px[j]], np.float32)
    if all_e.size == 0:
        raise RuntimeError("No predictions matched ground truth.")

    avg_hand = float(np.mean(hand_sizes)) if hand_sizes else 1.0
    all_en = all_e / avg_hand
    pck = {f"{int(t*100)}%": float((all_en < t).mean()) * 100 for t in (0.02, 0.05, 0.10)}
    fps = (1.0 / np.mean(times)) if times else 0.0

    per_point = {}
    for j in labelled:
        e, ep = np.array(errors[j]), np.array(errors_px[j])
        per_point[str(j)] = {
            "samples": int(e.size),
            "mae_norm": float(e.mean()), "rmse_norm": float(np.sqrt((e**2).mean())),
            "mae_px": float(ep.mean()), "rmse_px": float(np.sqrt((ep**2).mean())),
        }

    summary = {
        "dataset": {
            "gt_csv": str(gt_csv), "image_dir": str(img_dir),
            "total_images": total, "detected_images": detected, "skipped_images": skipped,
            "detection_rate_%": (detected / total * 100) if total else 0.0,
            "labelled_point_indices": labelled,
        },
        "overall": {
            "mae_norm": float(all_e.mean()), "rmse_norm": float(np.sqrt((all_e**2).mean())),
            "mae_px": float(all_px.mean()), "rmse_px": float(np.sqrt((all_px**2).mean())),
            "pck": pck, "fps": float(fps),
        },
        "per_point": per_point,
    }

    ranked = sorted(((int(k), v["mae_norm"]) for k, v in per_point.items()), key=lambda x: x[1])
    print("=" * 72)
    print("  MODEL EVALUATION  (metrics on all points with ground truth)")
    print("=" * 72)
    print(f"Images detected     : {detected}/{total}  (skipped {skipped})")
    print(f"Labelled points     : {len(labelled)}  -> {labelled[:1]+['..']+labelled[-1:] if len(labelled)>2 else labelled}")
    print(f"Overall MAE (norm)  : {all_e.mean():.5f}")
    print(f"Overall RMSE (norm) : {np.sqrt((all_e**2).mean()):.5f}")
    print(f"Overall MAE (px)    : {all_px.mean():.2f}")
    print(f"PCK@2/5/10%         : {pck['2%']:.1f}% / {pck['5%']:.1f}% / {pck['10%']:.1f}%")
    print(f"Inference speed     : {fps:.1f} FPS")
    print(f"Best 5  : " + ", ".join(f"Pt{j}({m:.4f})" for j, m in ranked[:5]))
    print(f"Worst 5 : " + ", ".join(f"Pt{j}({m:.4f})" for j, m in ranked[-5:]))
    print("=" * 72)

    if save_json:
        Path(save_json).parent.mkdir(parents=True, exist_ok=True)
        with open(save_json, "w") as f:
            json.dump(summary, f, indent=2)
        print(f"Saved metrics -> {save_json}")
    return summary


def main():
    ap = argparse.ArgumentParser(description="Evaluate the 64-point model")
    ap.add_argument("--model", default=str(C.MODEL_PATH))
    ap.add_argument("--gt", default=str(C.GT_CSV))
    ap.add_argument("--img", default=str(C.IMAGES_DIR))
    ap.add_argument("--save-json", default=str(C.ROOT / "docs" / "metrics_latest.json"))
    args = ap.parse_args()
    evaluate(Path(args.model), Path(args.gt), Path(args.img),
             Path(args.save_json) if args.save_json else None)


if __name__ == "__main__":
    main()
