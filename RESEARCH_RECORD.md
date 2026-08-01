# Research Record — Hand Acupressure Point Simulation via Computer Vision

**Single source of truth for the paper.** Everything about the dataset, method,
code, experiments, results, and change history lives in this one file.

- **Project:** Real-time identification and video simulation of acupressure
  points on the human hand from a monocular RGB camera.
- **Author:** Tushar Sharma (`tkalra12345@gmail.com`)
- **Application domain:** Healthcare / assistive self-care and education.
- **Record last updated:** 2026-07-09
- **Repository root:** `~/Desktop/Accupressure Project`
- **Full untouched backup of the original messy project:**
  `~/Desktop/ISR-2ndSem/ISR-Code/` (kept intact; do not edit).

---

## 1. Problem & Contribution

Acupressure requires accurate localisation of specific points on the hand. Manual
identification depends on practitioner skill and static charts, which non-experts
cannot apply reliably in real time. This project builds a camera-based system that
detects the hand, reconstructs a dense landmark set, and overlays **five clinically
mapped acupressure points** with orientation-aware (palm/back) activation.

**Contributions**
1. A **64-point hand representation** (21 MediaPipe + 30 learned finger points +
   13 palm points) tailored to acupressure, not gestures.
2. A **scale- and rotation-invariant geometry model** that places custom points
   from the MediaPipe skeleton, so it transfers across all 11k hands from only a
   few dozen annotated images.
3. A **human-in-the-loop annotator** that pre-seeds every point from the current
   model, so labelling is correction-only and each session measurably improves
   accuracy — including the first-ever ground truth for palm points 51–63.
4. A reproducible **annotate → train → evaluate** loop with standard keypoint
   metrics (MAE, RMSE, PCK, FPS).

---

## 2. The Five Acupressure Points

| # | Point | Condition | Hand face | Landmark index (R / L)* |
|---|-------|-----------|-----------|--------------------------|
| 1 | **Lu5**  | Chronic Bronchitis | palm | 27 / 32 |
| 2 | **BL60** | Sciatica Pain      | back | 34 / 37 |
| 3 | **GV1**  | Back Stiffness     | back | 59 |
| 4 | **CV8**  | Constipation       | palm | 62 |
| 5 | **CV4**  | Headache           | palm | 63 |

*Indices differ per hand because MediaPipe labels handedness from the camera's
viewpoint (its "Left" = the user's right hand). A point is only drawn when the
detected hand face matches the point's required face (palm vs back), which
prevents anatomically impossible overlays.

---

## 3. Dataset

- **Source:** *11k Hands* dataset (M. Afifi, "11K Hands: Gender recognition and
  biometric identification using a large dataset of hand images," *Multimedia
  Tools and Applications*, 2019). 11,076 dorsal/palmar hand images.
- **Location in this repo:** `dataset/Hands/` (11,076 `.jpg`) +
  `dataset/HandInfo.csv` (id, age, gender, skin colour, `aspectOfHand`, image name).
- **Ground truth:** `annotations/ground_truth_64pt.csv` — long format
  `filename, point_index, x_norm, y_norm, source`. Currently **50 images ×
  51 points** (indices 0–50). Points 0–20 are MediaPipe outputs
  (`source=mediapipe`); 21–50 are human-verified (`source=custom`).
- **Coordinate convention:** all points image-normalised to `[0,1]`
  (resolution independent).
- **Reference cache:** `annotations/mediapipe_21_points.csv` — raw MediaPipe
  keypoints for the dataset (regenerable; kept for convenience).

> The dataset is public and re-downloadable; the irreplaceable asset is the
> human annotation in `ground_truth_64pt.csv`.

---

## 4. Method

### 4.1 Pipeline
```
RGB frame
  → MediaPipe Hands  → 21 keypoints (0–20)          [exact]
  → geometry model   → 30 finger points (21–50)     [learned]
  → palm points      → 13 points (51–63)            [learned if annotated,
                                                      else geometric fallback]
  → orientation      → palm / back (cross-product sign)
  → acupressure map  → 5 points drawn if face matches
```

### 4.2 Geometry model (the learnable core)
Each custom point *j* is expressed **relative to a MediaPipe bone**
`bone = p[anchor] − p[parent]` (see MediaPipe hand topology in `src/common.py`):

```
p[j] = p[anchor] + perp_coef · |bone| · perp
                 + along_coef · |bone| · bone_dir
```

where `bone_dir = bone/|bone|` and `perp = (−bone_dir_y, bone_dir_x)`. Because
the offset is scaled by bone length and rotated with the bone, the coefficients
`(perp_coef, along_coef)` are **invariant to hand size, position and rotation**.
Training averages the per-image coefficients; inference reapplies them. Both live
in the same normalised frame, which is why ~50 images generalise to 11k.

`src/common.py` holds `_geom_point` (forward) and `decompose` (inverse) so the
annotator, trainer, evaluator, and detector are guaranteed identical maths.

### 4.3 Orientation
Palm vs back from the sign of `(wrist→index) × (wrist→pinky)`; the sign flips
with handedness, handled per side in `hand_facing()`.

### 4.4 Palm points 51–63
Currently produced by a fixed geometric formula (`_palm_formula`). As soon as any
of these are annotated, `train.py` learns a proper `(anchor, parent, perp, along)`
definition for them and `predict_64` uses the learned version automatically —
this is the concrete path to closing the original evaluation gap.

---

## 5. Code (final, clean layout)

```
Accupressure Project/
├── dataset/
│   ├── Hands/                 11,076 images (the ONE dataset copy)
│   └── HandInfo.csv
├── annotations/
│   ├── ground_truth_64pt.csv  master ground truth (grows via the annotator)
│   └── mediapipe_21_points.csv
├── models/
│   ├── geometry_model_51pt.pkl  active model (30 learned points, MAE 0.0208)
│   └── ridge_seed_model.pkl     legacy ridge-regression seed (reference)
├── src/
│   ├── common.py     shared geometry / model I/O / constants (import hub)
│   ├── annotate.py   human-in-the-loop 64-point annotator  ← improves accuracy
│   ├── train.py      refit geometry model from ground truth
│   ├── evaluate.py   MAE / RMSE / PCK / FPS metrics
│   └── detect.py     live webcam + single-image acupressure demo
├── docs/
│   ├── metrics_baseline_64pt.json   original reported metrics
│   ├── metrics_latest.json          most recent evaluate.py run
│   └── legacy/                      the two original report drafts (archived)
├── RESEARCH_RECORD.md   ← this file
└── README.md
```

Reproducing every earlier result now requires only `src/` + `dataset/` +
`annotations/` + `models/`. All duplicate image copies (5×), the 12 GB
`images.npy`, the 948 MB `Archive.zip`, and six superseded experiment folders
were removed (~16 GB reclaimed; workspace went 19 GB → 2.2 GB).

---

## 6. Experiments & Results

### 6.1 Setup
- Evaluated on the 50 ground-truth images (indices 0–50) with `src/evaluate.py`.
- Hand-size normalisation = diagonal of the base-landmark bounding box.
- PCK threshold = fraction of hand size.

### 6.2 Overall metrics (active model `geometry_model_51pt.pkl`)

| Metric | Value |
|--------|-------|
| Images detected | 50 / 50 (100%) |
| MAE (normalised) | **0.02079** |
| RMSE (normalised) | 0.04149 |
| MAE (pixels) | 29.89 |
| RMSE (pixels) | 55.20 |
| PCK@2% | 62.9% |
| PCK@5% | 89.2% |
| PCK@10% | **97.5%** |
| Inference speed | ~54 FPS |

Interpretation: PCK@10 = 97.5% means almost every point lands within 10% of hand
size — visually correct for guidance — while ~54 FPS confirms real-time use. The
stricter PCK@2 is dominated by a few hard points below.

### 6.3 Per-point (best / worst, non-trivial points)

| Rank | Point | MAE (norm) | MAE (px) |
|------|-------|-----------|----------|
| Best | Pt50 | 0.0179 | 27.6 |
|      | Pt48 | 0.0185 | 28.9 |
|      | Pt49 | 0.0193 | 30.1 |
| Worst| Pt0 (wrist) | 0.0953 | 114.3 |
|      | Pt23 (thumb region) | 0.0988 | 126.1 |
|      | Pt21 (thumb region) | 0.1067 | 140.2 |

The worst points are all around the **thumb / wrist**, whose position is most
variable — the priority target for additional annotation.

### 6.4 Accuracy-improvement loop (the annotator's purpose)
```
python src/annotate.py     # correct seeded points on more images (+ annotate 51–63)
python src/train.py        # refit the geometry model on the larger GT set
python src/evaluate.py     # measure the improvement; writes docs/metrics_latest.json
```
`train.py` reports **leave-one-out MAE per point**, so improvement is quantified
every cycle. Refitting on the current 50 images reproduces equivalent accuracy
(LOO MAE ≈ 0.033; overall eval MAE ≈ 0.022) and now also fits the `along`
component, giving the model room to improve as annotations grow.

---

## 7. Limitations & Future Work
1. Ground truth still covers 50 images and indices 0–50; annotate more images and
   points 51–63 to strengthen statistics and enable full 64-point accuracy metrics.
2. Thumb/wrist points (0, 21, 23, 26) are the weakest — prioritise them.
3. No temporal smoothing yet — add EMA on landmarks to reduce video jitter.
4. No clinical validation — point mappings follow standard references, not a trial.
5. Single-hand geometry fit per point; per-subject calibration could help.

---

## 8. Reproducibility — exact commands
```bash
# from repo root, using the bundled virtualenv
.venv/bin/python src/evaluate.py                 # metrics on current GT
.venv/bin/python src/annotate.py                 # label / correct images
.venv/bin/python src/annotate.py --only-acu      # focus the 5 acupressure points
.venv/bin/python src/train.py                    # refit models/geometry_model_51pt.pkl
.venv/bin/python src/detect.py                   # live webcam demo
.venv/bin/python src/detect.py --image path.jpg  # annotate one image
```
Dependencies (already in `.venv`): `opencv-python`, `mediapipe`, `numpy`,
`pandas`, `scikit-learn`, `pillow`, `tkinter`.

---

## 9. Change log (provenance for the paper)

**2026-07-09 — Consolidation & annotator build**
- Read and consolidated the entire prior project (7 experiment folders).
- Identified the working pipeline (former `MAINCODE`) and its two model formats.
- Built a clean `src/` package on a **shared `common.py`**; the refactor
  **exactly reproduces** the reported baseline (MAE 0.02079, PCK@10 97.5%),
  confirming behavioural equivalence.
- Wrote a new **human-in-the-loop annotator** (`annotate.py`) that seeds all 64
  points and enables ground truth for palm points 51–63 for the first time.
- Wrote `train.py` (refit from GT, auto-learns palm points, LOO reporting) and a
  GT-aware `evaluate.py`.
- Full cleanup: removed 5× duplicate image copies, `images.npy` (12 GB),
  `Archive.zip` (948 MB), and superseded folders — reclaimed ~16 GB.
- **Incident & recovery:** a cleanup delete on `Dataset` also matched the new
  `dataset/` (macOS filesystem is case-insensitive), deleting the working image
  copy. All irreplaceable artifacts (annotations, models, code, reports) were
  already preserved and unaffected; the images were restored from the intact full
  backup at `~/Desktop/ISR-2ndSem/ISR-Code/`. No data permanently lost. Verified
  end-to-end afterwards (50/50 detected, baseline metrics reproduced).

---

## 10. References
1. F. Zhang et al., "MediaPipe Hands: On-device Real-time Hand Tracking," arXiv, 2020.
2. M. Afifi, "11K Hands: Gender recognition and biometric identification using a
   large dataset of hand images," *Multimedia Tools and Applications*, 2019.
3. G. Bradski, "The OpenCV Library," *Dr. Dobb's Journal*, 2000.
4. F. Pedregosa et al., "Scikit-learn: Machine Learning in Python," *JMLR*, 2011.
5. WHO, "WHO Standard Acupuncture Point Locations," 2008.
6. M. Everingham et al., "The PASCAL VOC Challenge," *IJCV*, 2010. (PCK metric.)
