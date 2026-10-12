#!/usr/bin/env python3
"""
holdout_compare.py — v1 (geometry) vs v2 (hybrid) on the SAME random
train/test image split (same seed/fraction as evaluate.py --holdout), so the
two numbers are directly comparable. Neither model sees the test images
during fitting.

Run:
    python model/holdout_compare.py --test-frac 0.3 --seed 42
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import common as C
import train as T
import train_v2 as T2
from evaluate import evaluate


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gt", default=str(C.GT_CSV))
    ap.add_argument("--img", default=str(C.IMAGES_DIR))
    ap.add_argument("--test-frac", type=float, default=0.3)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--min-samples-ridge", type=int, default=15)
    args = ap.parse_args()

    import pandas as pd
    df = pd.read_csv(args.gt)
    df = df[(df["point_index"] < 21) | (df["source"].isin(C.TRUSTED_SOURCES))]
    images = sorted(df["filename"].unique())
    rng = np.random.RandomState(args.seed)
    shuffled = images.copy()
    rng.shuffle(shuffled)
    n_test = max(1, int(round(len(shuffled) * args.test_frac)))
    test_images, train_images = shuffled[:n_test], shuffled[n_test:]
    print(f"Split: {len(train_images)} train / {len(test_images)} test images "
          f"(seed={args.seed}, frac={args.test_frac})\n")

    existing = C.load_point_defs(C.MODEL_PATH)

    # v1: geometry only, fit on train split
    gt_train = T.load_gt(args.gt, only_filenames=set(train_images))
    v1_defs, _ = T.fit(gt_train, existing_defs={}, min_samples=3)
    v1_tmp = C.MODELS_DIR / "_v1_holdout_tmp.pkl"
    C.save_point_defs(v1_defs, v1_tmp, source="v1_holdout_fit")

    # v2: hybrid geometry-or-ridge, fit on the SAME train split
    v2_defs, rows = T2.fit_hybrid(gt_train, existing, args.min_samples_ridge)
    v2_tmp = C.MODELS_DIR / "_v2_holdout_tmp.pkl"
    C.save_point_defs(v2_defs, v2_tmp, source="v2_holdout_fit")

    print("### v1 (geometry only) — held-out test images ###")
    r1 = evaluate(v1_tmp, args.gt, args.img, only_images=set(test_images))
    print("\n### v2 (hybrid) — SAME held-out test images ###")
    r2 = evaluate(v2_tmp, args.gt, args.img, only_images=set(test_images))

    v1_tmp.unlink(missing_ok=True)
    v2_tmp.unlink(missing_ok=True)

    print("\n" + "=" * 60)
    print("  SUMMARY — same random held-out split, both models")
    print("=" * 60)
    o1, o2 = r1["overall"], r2["overall"]
    print(f"{'metric':<16}{'v1':>10}{'v2':>10}")
    print(f"{'MAE (norm)':<16}{o1['mae_norm']:>10.5f}{o2['mae_norm']:>10.5f}")
    print(f"{'RMSE (norm)':<16}{o1['rmse_norm']:>10.5f}{o2['rmse_norm']:>10.5f}")
    print(f"{'MAE (px)':<16}{o1['mae_px']:>10.2f}{o2['mae_px']:>10.2f}")
    for k in ("1%", "2%", "5%", "10%"):
        print(f"{'PCK@'+k:<16}{o1['pck'][k]:>9.1f}%{o2['pck'][k]:>9.1f}%")


if __name__ == "__main__":
    main()
