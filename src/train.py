#!/usr/bin/env python3
"""
train.py — Fit / refit the geometry model from ground truth.
============================================================
Reads annotations/ground_truth_64pt.csv and, for every custom point
(21-63) that has ground truth, learns how to place it from the MediaPipe
skeleton:

    point = anchor + perp_coef * |bone| * perp + along_coef * |bone| * bone_dir

where `bone = anchor - parent` on the MediaPipe hand. The coefficients are the
average of the per-image decomposition, which is scale- and rotation-invariant,
so a handful of well-annotated images already generalises across all 11k hands.

Why this raises accuracy:
  * more annotated images  -> better-averaged coefficients (less noise),
  * palm points 51-63 that used a fixed formula now get *learned* placements
    as soon as you annotate them, replacing the hand-tuned constants.

For points 21-50 the anchor/parent pairing from the existing model is reused;
for newly annotated points it is chosen automatically (nearest MediaPipe joint
+ its kinematic parent). Leave-one-out MAE is reported per point.

Run:
    python src/train.py                       # writes models/geometry_model_51pt.pkl
    python src/train.py --min-samples 5       # only fit points with >=5 GT images
    python src/train.py --out models/new.pkl  # write elsewhere (keep old as backup)
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C


def load_gt(csv_path: Path):
    """Return {filename: (pts_21, {idx: xy})} using the stored MediaPipe rows."""
    df = pd.read_csv(csv_path)
    out = {}
    for fname, sub in df.groupby("filename"):
        base = sub[sub["point_index"].between(0, 20)]
        if len(base) < 21:
            continue
        pts_21 = np.zeros((21, 2), np.float32)
        ok = True
        for _, r in base.iterrows():
            pts_21[int(r["point_index"])] = [r["x_norm"], r["y_norm"]]
        custom = {int(r["point_index"]): np.array([r["x_norm"], r["y_norm"]], np.float32)
                  for _, r in sub[sub["point_index"] >= 21].iterrows()}
        out[fname] = (pts_21, custom)
    return out


def choose_anchor_parent(samples, existing_def):
    """Reuse the model's anchor/parent if known, else pick the nearest
    MediaPipe joint (averaged over images) and its kinematic parent."""
    if existing_def is not None:
        return existing_def["anchor"], existing_def["parent"]
    acc = np.zeros(21)
    for pts_21, target in samples:
        acc += np.linalg.norm(pts_21 - target, axis=1)
    anchor = int(np.argmin(acc / len(samples)))
    return anchor, C.MP_PARENT[anchor]


def fit(gt, existing_defs, min_samples):
    point_defs = {}
    report = []
    for j in C.CUSTOM_RANGE:
        samples = [(p21, custom[j]) for p21, custom in gt.values() if j in custom]
        if len(samples) < min_samples:
            continue
        anchor, parent = choose_anchor_parent(samples, existing_defs.get(j))
        perps, alongs = [], []
        for pts_21, target in samples:
            pc, ac = C.decompose(pts_21, target, anchor, parent)
            perps.append(pc)
            alongs.append(ac)
        mean_perp, mean_along = float(np.mean(perps)), float(np.mean(alongs))
        point_defs[j] = {"anchor": anchor, "parent": parent,
                         "mean_perp": mean_perp, "mean_along": mean_along}

        # leave-one-out MAE in normalised (hand-relative) units
        loo = []
        perps, alongs = np.array(perps), np.array(alongs)
        for i in range(len(samples)):
            mp = (perps.sum() - perps[i]) / (len(samples) - 1) if len(samples) > 1 else perps[i]
            ma = (alongs.sum() - alongs[i]) / (len(samples) - 1) if len(samples) > 1 else alongs[i]
            pts_21, target = samples[i]
            pred = C._geom_point(pts_21, {"anchor": anchor, "parent": parent,
                                          "mean_perp": mp, "mean_along": ma})
            loo.append(float(np.linalg.norm(pred - target)))
        report.append((j, len(samples), float(np.mean(loo))))
    return point_defs, report


def main():
    ap = argparse.ArgumentParser(description="Fit the acupressure geometry model")
    ap.add_argument("--gt", default=str(C.GT_CSV))
    ap.add_argument("--out", default=str(C.MODEL_PATH))
    ap.add_argument("--min-samples", type=int, default=3,
                    help="minimum GT images required to fit a point (default 3)")
    args = ap.parse_args()

    print("=" * 66)
    print("  Fitting geometry model from ground truth")
    print("=" * 66)

    gt = load_gt(Path(args.gt))
    print(f"Ground-truth images usable : {len(gt)}")
    if not gt:
        raise SystemExit("No usable ground truth found. Annotate some images first.")

    existing = {}
    try:
        existing = C.load_point_defs(C.MODEL_PATH)
    except Exception:
        pass

    point_defs, report = fit(gt, existing, args.min_samples)
    if not point_defs:
        raise SystemExit("No point had enough samples. Lower --min-samples or annotate more.")

    C.save_point_defs(point_defs, Path(args.out), source="GT_geometry_retrained")

    report.sort(key=lambda r: r[2])
    maes = [r[2] for r in report]
    print(f"\nPoints fitted              : {len(point_defs)}  (indices "
          f"{min(point_defs)}..{max(point_defs)})")
    palm = [j for j in point_defs if j >= 51]
    print(f"Palm points now LEARNED    : {sorted(palm) if palm else 'none yet — annotate 51-63'}")
    print(f"Mean LOO MAE (normalised)  : {np.mean(maes):.4f}")
    print("\nBest 5 points  : " + ", ".join(f"Pt{j}({m:.4f})" for j, n, m in report[:5]))
    print("Worst 5 points : " + ", ".join(f"Pt{j}({m:.4f})" for j, n, m in report[-5:]))
    print(f"\nSaved model -> {args.out}")
    print("Next: python src/evaluate.py   then   python src/detect.py")


if __name__ == "__main__":
    main()
