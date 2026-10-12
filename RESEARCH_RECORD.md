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

**2026-08-19 — Environment rebuild, methodology-honesty fixes, palm-point visual audit**
- **Context:** owner asked for all 64 points to be "perfect" (99% accuracy) and
  for a fused approach using an external pretrained model. Investigated feasibility
  and ran a systematic honesty/quality pass on the existing pipeline first, since
  several issues would have undermined any accuracy number reported.
- **Environment:** the repo's `.venv` pointed at a path from before the project
  folder was renamed (`~/Desktop/Accupressure Project` → `Acupressure-Project`)
  and no longer existed. Rebuilt `.venv` with Python 3.12 (3.13/3.14 are not yet
  supported by MediaPipe). `pip install mediapipe` now resolves to `mediapipe
  1.0.1`, a new major version that **removed** the legacy `mp.solutions.hands`
  API this codebase depends on (replaced by a new Tasks API) — pinned to
  `mediapipe==0.10.21` instead of migrating the pipeline. Full `evaluate.py` run
  reproduced the exact baseline (MAE 0.02079, PCK@10 97.5%), confirming the
  rebuilt environment is behaviourally identical to the original.
- **Data-integrity bug found and fixed:** `annotate.py` tagged **every** point
  21–63 as `source=custom` on save, even points a person never touched (just
  passed through from the model's seed). `train.py`/`evaluate.py` then treated
  every such row as ground truth — meaning an un-reviewed model-seeded point
  could be trained on, or evaluated against, as if it were verified, silently
  deflating error metrics (a point compared to a copy of itself scores zero
  error). Fixed: `annotate.py` now tracks which points were actually
  dragged/nudged per image and tags accordingly (`human_verified` vs
  `model_seed`); `train.py`/`evaluate.py` now only trust
  `{mediapipe, custom, human_verified, ai_vision}` sources
  (`common.TRUSTED_SOURCES`) and silently ignore `model_seed` rows. Existing
  50-image ground truth (all tagged `custom`) is unaffected — that data predates
  the bug and was collected through deliberate correction sessions.
- **Added honest held-out evaluation** (`evaluate.py --holdout [--test-frac]`):
  fits the geometry model on a random image subset and scores only on the
  unseen remainder, instead of the original same-set (train==test) evaluation.
  Result on the current 50-image set (35 train / 15 test, seed 42): MAE 0.02130,
  PCK@10 95.7% — close to the same-set number (0.02079 / 97.5%), i.e. the model
  is not badly overfit on points 0–50. Both numbers are now reported so future
  claims distinguish "fit accuracy" from "generalisation accuracy."
- **Palm-point (51–63) visual audit — the first check of this range against any
  real image, ever.** Rendered the model's current formula-based predictions
  (still zero ground truth) on 20 images never seen by the model: 12 random
  palmar, 4 random dorsal, 4 flagged "irregular" in `HandInfo.csv` (skin marks,
  not pose variation) — spanning both hand sides, multiple skin tones, and
  varied rotation/scale. Visually reviewed each against the real photo.
  **Finding: all 13 palm points landed in anatomically sensible regions in
  every image — no failures found.** This is genuinely new evidence (the
  formula was previously untested against reality in any form) but is a
  qualitative pass/fail check, not pixel-level ground truth: no independent
  corrected coordinates were produced (doing so without a measurement/grid
  reference would have been guessing, not annotating, and guessed "corrections"
  identical to the model's own output would be circular — see the bug above).
  No retraining was triggered by this pass; the palm-point formula in
  `common.py::_palm_formula` is unchanged. **This does not mean the palm points
  are accurate** — it means the geometric formula is *stable and plausible*
  across diverse hands, not that it matches true anatomical landmarks. Real
  pixel-level ground truth for 51–63 still does not exist.
- **Not done / explicitly deferred:** the owner asked about fusing a pretrained
  external hand-mesh model (MANO-based, e.g. MobRecon/HaMeR) to give the palm
  points real geometric grounding instead of the fixed formula. Every viable
  option is built on the MANO hand model, whose weights require a personal
  account and acceptance of a non-commercial license at mano.is.tue.mpg.de —
  a decision only the project owner can make. Deferred pending that decision.
- **Correction to the owner's framing:** "99% accuracy" / "perfect" is not a
  coherent target for this kind of landmark regression — there is no published
  benchmark for palm-surface points at all, and even SOTA hand-mesh models
  report a few millimetres of error post-alignment on curated data with real
  labels. A defensible target is PCK@5 in the mid-90s on a genuinely held-out
  test set, with real (non-zero) ground truth eventually covering all 64
  points — not a single "accuracy" percentage.

**2026-08-19 (same day, later) — Second model: whole-hand ridge regression, kept alongside the original**
- **Owner's request:** build a new, more accurate model without discarding
  the original. Given the palm points (51–63) still have zero ground truth
  (see above — nothing has changed there), the only points where a real,
  honestly-measured improvement is even possible are 21–50, which do have 50
  images of verified ground truth.
- **What changed technically.** The original model (`_geom_point` in
  `core/common.py`) places each custom point from exactly ONE local bone
  (anchor→parent), fitting 2 numbers (perp, along coefficients) per point —
  cheap, but can't capture position depending on more than one part of the
  hand (e.g. thumb points, which also depend on finger spread, not just the
  local thumb bone). Added a second model type: **ridge regression from the
  whole hand's shape** — all 21 MediaPipe points, expressed in the same
  translation/rotation/scale canonical frame the project already uses
  (anchored on the wrist→middle-MCP bone, same convention as `MP_PARENT`),
  flattened to 42 features, regressed to each custom point's canonical
  position (`hand_canonical_frame`, `hand_features_42`, `_ridge_point` in
  `core/common.py`; fit in new `model/train_v2.py`).
- **Honest comparison methodology.** Both model types were compared with
  **exact leave-one-out cross-validation** — every one of the 50 images
  refit with that image held out, not an approximation — on identical
  ground truth. For each point, whichever model had the lower LOO error was
  kept; this is not a blind swap, 1 of 30 points (pt 24) still uses the
  original geometry formula because ridge was worse there.
- **Result — real, held-out-validated improvement:**
  | | Geometry only (v1) | Hybrid, best-per-point (v2) |
  |---|---|---|
  | Mean LOO MAE (points 21–50) | 0.0330 | **0.0110** (−67%) |
  | Points where ridge won | — | 29 / 30 |
  | Worst point (pt 21, thumb) LOO MAE | 0.1360 | **0.0256** |
  Full per-point table printed by `model/train_v2.py`. Same-set sanity check
  via `model/evaluate.py --model model/weights/geometry_model_v2_hybrid.pkl`:
  overall MAE 0.02079→0.01139, PCK@10 97.5%→97.9%, PCK@5 89.2%→93.7%,
  PCK@2 62.9%→85.6%, PCK@1 39.5%→68.9% (same-set numbers, expected to be
  somewhat optimistic like all same-set numbers, but the LOO numbers above
  are the trustworthy ones and show the same large gap).
- **Important caveat, stated plainly:** all 50 ground-truth images come from
  the same controlled studio-photography protocol (the 11k Hands dataset —
  plain background, consistent framing). The ridge model has far more
  parameters (42 inputs × 2 outputs per point) than the geometry model (2
  parameters per point) and *could* be picking up something specific to that
  photography style rather than pure hand anatomy, in a way LOO-on-this-
  dataset cannot detect (LOO only tells you the model generalises *within*
  this data's distribution, not to a different one, e.g. a real webcam photo
  with a cluttered background or an off-angle phone camera). The geometry
  model's stronger physical constraint (one local bone) makes it plausibly
  more robust to that kind of distribution shift even where it fits this
  dataset less tightly. **Recommendation before fully trusting v2 for the
  live demo: test it on real webcam frames (not just the 11k Hands photos)
  and compare qualitatively against v1.**
- **Both models are preserved, nothing overwritten:**
  `model/weights/geometry_model_51pt.pkl` (v1, byte-identical to the
  original commit — hash `d7cca853...4d63fc94e`, verified unchanged) and
  `model/weights/geometry_model_v2_hybrid.pkl` (v2, new). Every script
  (`evaluate.py`, `detect.py`, `annotate.py`) takes `--model <path>` to
  choose which one to run; nothing defaults to v2 automatically.
- **Palm points 51–63: still unchanged, still zero ground truth.** v2 uses
  the identical `_palm_formula` fallback as v1 for these — this update does
  not touch the weakest part of the system, including the 3 clinical points
  (GV1, CV8, CV4) that live in that range. That remains the highest-value
  next annotation target.

**2026-08-19 (same day, later still) — Ground-truth expansion attempt (honest null result) + proper apples-to-apples holdout**
- **Owner asked to also improve the ground truth itself**, not just the
  model architecture. Attempted this on the weakest points (21, 23, 26 —
  thumb region, MAE 0.10–0.14) since fingers are simple visible line
  segments (unlike the palm's soft blended regions), which should make
  visual verification much more tractable than the earlier palm-point audit.
- Rendered the current model's thumb-point predictions, zoomed and labelled,
  on 10 new images never used for any ground truth (mix of hand sizes,
  angles, and thumb poses — straight, curled, opposed). Reviewed each
  against the real photo.
- **Result: every placement was individually plausible in all 10 images** —
  points sit sensibly on the visible thumb edges at every joint, even across
  very different thumb angles. No independently-correctable error found,
  same outcome as the earlier palm-point audit.
- **Why, and what this actually means:** the high LOO error on these points
  isn't a single visibly-wrong placement — it's *inconsistency across many
  images* (the single-bone model can't capture thumb-angle variation), which
  is invisible when reviewing one image at a time. This is exactly the
  failure mode the whole-hand ridge model (v2, above) already targets by
  construction. Manually confirming "looks fine" on more images would have
  added data that's suspiciously close to the model's own predictions —
  the same circularity risk the `model_seed` bug fix (above) exists to
  prevent — so no new `ai_vision` rows were added from this pass.
- **Instead, closed the comparison gap properly:** added
  `model/train_v2.py::fit_hybrid()` (reusable) and a new
  `model/holdout_compare.py` that fits v1 (geometry) and v2 (hybrid) on the
  *identical* random 35-train/15-test image split (same seed as
  `evaluate.py --holdout`) and evaluates both on the same unseen 15 images —
  a fully apples-to-apples, genuinely held-out comparison, not just LOO.

  | Metric | v1 (held-out) | v2 (held-out, same split) |
  |---|---|---|
  | MAE (normalised) | 0.02130 | **0.01198** |
  | RMSE (normalised) | 0.03957 | **0.02457** |
  | MAE (pixels) | 31.07 | **15.56** |
  | PCK@1% | 40.0% | **58.8%** |
  | PCK@2% | 62.5% | **81.8%** |
  | PCK@5% | 87.5% | **95.0%** |
  | PCK@10% | 95.7% | **97.9%** |
  | Worst point (pt 21, thumb) | 0.1426 | **0.0630** |

  This confirms the exact-LOO result from earlier wasn't a fitting artifact
  — v2 is genuinely more accurate on images neither model was fit on.
- **Ground truth itself is unchanged** by this entry — same 50 images, same
  annotations. The improvement documented here is 100% architectural (v2's
  ridge model), not from new data. Palm points 51–63 still have zero ground
  truth.

**2026-10-12 — Su Jok correspondence system added as a separate section**
- **Source studied:** Su Jok Academy (International Su Jok Therapy
  Association), *Manual for attendants of the course "Fundamentals of Su Jok
  therapy", Cycle 1: Standard correspondence systems of hands and feet*,
  Moscow, 2000 — the method of Prof. Park Jae Woo.
- **Mapping used (standard correspondence system):** thumb = head (distal
  phalanx) and neck (proximal phalanx); thenar eminence = chest (heart,
  lungs); rest of the palm = abdomen; index + little fingers = arms; middle +
  ring fingers = legs; finger joints MCP/PIP/DIP = shoulder–elbow–wrist and
  hip–knee–ankle; palm = front of body (Yin), back of hand = back of body
  (Yang); spine along the back of the thumb, then from the wrist to between
  the middle and ring knuckles. Body side: the thumb side of each hand is that
  hand's own body side (right hand: index = right arm, middle = right leg).
- **Finding:** the original 5 "hand_reflex" points already follow this map —
  Lu5 on the index "elbow", BL60 on the middle-finger "ankle", GV1 at Su Jok's
  anus/coccyx point, CV8/CV4 on the palm's navel/lower-abdomen zone.
- **Implementation (`core/common.py`):** 23 new `su_jok` points — 12 limb
  joints placed exactly on MediaPipe joints, side-aware (e.g. right knee = the
  right hand's middle-finger PIP or the left hand's ring-finger PIP), shown on
  either hand face (new `face: "any"`); 11 zone centres (head, throat, neck,
  chest, heart, stomach, intestine, pelvis, upper back, lower back) as a new
  `blend` point kind = weighted average of MediaPipe joints (weights sum to 1,
  so similarity-invariant like the palm formula). 16 Su Jok problems, kept
  separate from the 12 classical problems (unchanged).
- **App:** problem panel split into "Acupressure" and "Su Jok" tabs; every
  problem's solution image is now generated from four reference views of a
  template hand using the same geometry as the live tracker (the earlier PNGs
  were 11 identical blank templates + 1 marked image).
- **Caveat:** zone-centre weights are geometric estimates read from the
  manual's figures, not measured against annotated images; Su Jok itself has
  limited clinical evidence. Pending expert review, like the other DRAFT points.
- **Verified:** full test suite 36/36 passing (incl. new Su Jok tests:
  body-side mapping, "any"-face points, blend weights, every problem point
  drawable) on Windows, Python 3.12.10 + mediapipe 0.10.21; frontend builds
  and the generated diagrams were visually checked. The v1 model file hash
  and predict_64 golden outputs are unchanged.

---

## 10. References
1. F. Zhang et al., "MediaPipe Hands: On-device Real-time Hand Tracking," arXiv, 2020.
2. M. Afifi, "11K Hands: Gender recognition and biometric identification using a
   large dataset of hand images," *Multimedia Tools and Applications*, 2019.
3. G. Bradski, "The OpenCV Library," *Dr. Dobb's Journal*, 2000.
4. F. Pedregosa et al., "Scikit-learn: Machine Learning in Python," *JMLR*, 2011.
5. WHO, "WHO Standard Acupuncture Point Locations," 2008.
6. M. Everingham et al., "The PASCAL VOC Challenge," *IJCV*, 2010. (PCK metric.)
7. Su Jok Academy, "Manual for attendants of the course 'Fundamentals of Su Jok
   therapy', Cycle 1: Standard correspondence systems of hands and feet,"
   International Su Jok Therapy Association, Moscow, 2000.
8. Park Jae Woo, *A Guide to Su Jok Therapy* / *Su Jok for Everybody*, Su Jok
   Academy Publishers.
