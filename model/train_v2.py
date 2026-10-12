#!/usr/bin/env python3
"""
train_v2.py — Fit a second, independent point-placement model and keep BOTH.
==============================================================================
The original model (`geometry_model_51pt.pkl`) places each custom point from
ONE local bone: point = anchor + perp*bone + along*bone_dir (2 fitted
numbers per point, per common.py::_geom_point).

This script fits an alternative: ridge regression from the WHOLE hand's
shape (all 21 MediaPipe points, in the same translation/rotation/scale
canonical frame used elsewhere in this project — see
common.py::hand_canonical_frame) to each custom point. More expressive,
which can help points whose position depends on more than one local bone
(e.g. the thumb points, which are also affected by finger spread) — but
also more parameters fit from the same ~50 images, so it can overfit.

Both models are evaluated with EXACT leave-one-out cross-validation (every
sample refit with that one image held out — not an approximation) on the
identical ground truth, so the comparison is apples-to-apples. For each
point, whichever model has the lower LOO error is kept in a new hybrid
model file. The original model file is never touched.

Run:
    python model/train_v2.py                     # writes weights/geometry_model_v2_hybrid.pkl
    python model/train_v2.py --min-samples 10
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from sklearn.linear_model import Ridge, RidgeCV

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from core import common as C
from train import load_gt, choose_anchor_parent  # same-directory import


def geometry_loo(samples, anchor, parent):
    """Exact leave-one-out MAE for the geometry (single-bone) model."""
    perps, alongs = [], []
    for pts_21, target in samples:
        pc, ac = C.decompose(pts_21, target, anchor, parent)
        perps.append(pc)
        alongs.append(ac)
    perps, alongs = np.array(perps), np.array(alongs)
    errs = []
    for i in range(len(samples)):
        mp_ = (perps.sum() - perps[i]) / (len(samples) - 1)
        ma_ = (alongs.sum() - alongs[i]) / (len(samples) - 1)
        pts_21, target = samples[i]
        pred = C._geom_point(pts_21, {"anchor": anchor, "parent": parent,
                                       "mean_perp": mp_, "mean_along": ma_})
        errs.append(float(np.linalg.norm(pred - target)))
    return float(np.mean(errs)), {"kind": "geometry", "anchor": anchor, "parent": parent,
                                   "mean_perp": float(np.mean(perps)), "mean_along": float(np.mean(alongs))}


def ridge_loo(samples):
    """Exact leave-one-out MAE for the whole-hand ridge model. Picks alpha
    once via efficient built-in LOO (RidgeCV, cv=None) on the full sample,
    then re-validates with genuine per-fold refits at that alpha — the
    number we actually report and compare against the geometry model."""
    frames = [C.hand_canonical_frame(p21) for p21, _ in samples]
    if any(f is None for f in frames):
        return None, None
    X = np.stack([C.hand_features_42(p21, f) for (p21, _), f in zip(samples, frames)])
    y = np.stack([C.to_canonical(t, f) for (_, t), f in zip(samples, frames)])

    alphas = np.logspace(-2, 3, 25)
    try:
        picker = RidgeCV(alphas=alphas, cv=None, alpha_per_target=True).fit(X, y)
        alpha = picker.alpha_  # array of 2 (along, perp) or scalar depending on sklearn version
    except TypeError:
        picker = RidgeCV(alphas=alphas, cv=None).fit(X, y)
        alpha = picker.alpha_

    n = len(samples)
    errs = []
    for i in range(n):
        mask = np.ones(n, dtype=bool)
        mask[i] = False
        model = Ridge(alpha=alpha).fit(X[mask], y[mask])
        pred_uv = model.predict(X[i:i + 1])[0]
        pred = C.from_canonical(pred_uv, frames[i])
        errs.append(float(np.linalg.norm(pred - samples[i][1])))

    final = Ridge(alpha=alpha).fit(X, y)
    pdf = {"kind": "ridge",
           "coef": final.coef_.astype(np.float32),         # (2, 42)
           "intercept": final.intercept_.astype(np.float32)}
    return float(np.mean(errs)), pdf


def fit_hybrid(gt: dict, existing: dict, min_samples_ridge: int):
    """Fit the geometry-vs-ridge hybrid from a (possibly train-only) GT dict.
    Per-point choice is still made by LOO *within this GT set only* — when
    called with a train-split subset, test images never influence the
    choice, so this is safe to use for an honest held-out comparison."""
    hybrid_defs, rows = {}, []
    for j in C.CUSTOM_RANGE:
        samples = [(p21, custom[j]) for p21, custom in gt.values() if j in custom]
        if len(samples) < 3:
            continue
        anchor, parent = choose_anchor_parent(samples, existing.get(j))
        geo_mae, geo_pdf = geometry_loo(samples, anchor, parent)
        ridge_mae, ridge_pdf = (None, None)
        if len(samples) >= min_samples_ridge:
            ridge_mae, ridge_pdf = ridge_loo(samples)
        if ridge_mae is not None and ridge_mae < geo_mae:
            hybrid_defs[j], chosen = ridge_pdf, "ridge"
        else:
            hybrid_defs[j], chosen = geo_pdf, "geometry"
        rows.append((j, len(samples), geo_mae, ridge_mae, chosen))
    return hybrid_defs, rows


def main():
    ap = argparse.ArgumentParser(description="Fit + compare a ridge-regression alternative model")
    ap.add_argument("--gt", default=str(C.GT_CSV))
    ap.add_argument("--out", default=str(C.MODELS_DIR / "geometry_model_v2_hybrid.pkl"))
    ap.add_argument("--min-samples", type=int, default=15,
                     help="min GT images to even attempt the ridge model (42 features)")
    args = ap.parse_args()

    print("=" * 78)
    print("  train_v2 — geometry (1-bone) vs ridge (whole-hand) per point, exact LOO")
    print("=" * 78)

    gt = load_gt(Path(args.gt))
    print(f"Ground-truth images usable : {len(gt)}")

    existing = C.load_point_defs(C.MODEL_PATH)  # original model, read-only reference

    hybrid_defs = {}
    rows = []
    for j in C.CUSTOM_RANGE:
        samples = [(p21, custom[j]) for p21, custom in gt.values() if j in custom]
        if len(samples) < 3:
            continue

        anchor, parent = choose_anchor_parent(samples, existing.get(j))
        geo_mae, geo_pdf = geometry_loo(samples, anchor, parent)

        ridge_mae, ridge_pdf = (None, None)
        if len(samples) >= args.min_samples:
            ridge_mae, ridge_pdf = ridge_loo(samples)

        if ridge_mae is not None and ridge_mae < geo_mae:
            hybrid_defs[j] = ridge_pdf
            chosen, other_mae = "ridge", geo_mae
        else:
            hybrid_defs[j] = geo_pdf
            chosen, other_mae = "geometry", ridge_mae
        rows.append((j, len(samples), geo_mae, ridge_mae, chosen))

    C.save_point_defs(hybrid_defs, Path(args.out), source="v2_hybrid_geometry_or_ridge")

    print(f"\n{'pt':>4} {'n':>4} {'geometry MAE':>13} {'ridge MAE':>11}  chosen")
    print("-" * 55)
    n_ridge = 0
    for j, n, geo_mae, ridge_mae, chosen in rows:
        r_str = f"{ridge_mae:.4f}" if ridge_mae is not None else "  n/a"
        marker = " <-" if chosen == "ridge" else ""
        if chosen == "ridge":
            n_ridge += 1
        print(f"{j:>4} {n:>4} {geo_mae:>13.4f} {r_str:>11}  {chosen}{marker}")

    geo_only_mean = np.mean([g for _, _, g, _, _ in rows])
    hybrid_mean = np.mean([(r if c == "ridge" else g) for _, _, g, r, c in rows])
    print("-" * 55)
    print(f"Points where ridge won LOO : {n_ridge} / {len(rows)}")
    print(f"Mean LOO MAE — geometry only (v1) : {geo_only_mean:.4f}")
    print(f"Mean LOO MAE — hybrid (v2, best of either per point) : {hybrid_mean:.4f}")
    print(f"\nSaved new model -> {args.out}")
    print("Original model untouched -> " + str(C.MODEL_PATH))
    print("Compare end-to-end: .venv/bin/python model/evaluate.py --model "
          + args.out + " --holdout --test-frac 0.3")


if __name__ == "__main__":
    main()
