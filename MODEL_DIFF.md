# What Changed: Last Committed Version vs. Now

Baseline for this comparison: git commit `5432db3` ("Version-1"), the only
commit in the repo's history. Everything below is what's different in the
working directory right now, produced across two concurrent Claude Code
sessions working on this same project.

## Headline: the model itself has not changed

The trained model file (`model/weights/geometry_model_51pt.pkl`, formerly
`models/geometry_model_51pt.pkl`) is **byte-for-byte identical** to the
committed version — verified by SHA-256 hash:

```
d7cca853589849b22db2da8d9716b078947ce204eae4b216e6822ed4d63fc94e
```

Same 1,186 bytes, same coefficients, same predictions. **No retraining
happened.** Everything below is a change to code, methodology, tooling, or
project structure — not to point-placement accuracy. If you're writing this
up for a report: there is no "before/after accuracy" number to quote yet,
because the thing that would move that number (new verified ground truth for
points 21–63, especially the palm points 51–63) hasn't been added.

## 1. Project restructuring (session B)

| Before | After |
|---|---|
| `src/common.py` | `core/common.py` |
| `src/annotate.py` | `model/annotate.py` |
| `src/train.py` | `model/train.py` |
| `src/evaluate.py` | `model/evaluate.py` |
| `src/detect.py` | `simulation/detect.py` |
| `models/geometry_model_51pt.pkl` | `model/weights/geometry_model_51pt.pkl` |
| `models/ridge_seed_model.pkl` | `model/weights/ridge_seed_model.pkl` |
| *(nothing)* | `web/app.py`, `web/templates/index.html`, `web/static/css/style.css`, `web/static/js/app.js` — a new Flask front-end (~850 lines total) |
| *(nothing)* | `requirements.txt` — pins `numpy`, `opencv-python`, `opencv-contrib-python`, `mediapipe==0.10.21`, `pandas`, `pillow`, `Flask` |
| 2 top-level code dirs (`src/`, `models/`) | 4 (`core/`, `model/`, `simulation/`, `web/`), each with one job |

Every file move only changed import paths (`import common as C` →
`from core import common as C`) and path strings in docstrings/print
statements. No logic was altered by the restructuring itself — confirmed by
diffing old-path content against new-path content directly.

## 2. Bug fixes and methodology changes (session A, this session)

These are the substantive code changes, independent of where the files live.

### 2a. Fixed a ground-truth integrity bug
**Before:** `annotate.py` tagged *every* point 21–63 as `source=custom` on
save, even points a person never touched (just passed through from the
model's own seed). `train.py` and `evaluate.py` treated any such row as real
ground truth.
**Risk this created:** a model prediction could be trained on, or evaluated
against, a copy of itself — silently producing a falsely low error number.
**Fix (4 files touched: `core/common.py`, `model/annotate.py`,
`model/train.py`, `model/evaluate.py`):**
- `annotate.py` now tracks which points were actually dragged/nudged per
  image (`self.touched`) and saves `human_verified` vs `model_seed`
  accordingly (~10 lines changed).
- `common.py` adds `TRUSTED_SOURCES = {"mediapipe", "custom",
  "human_verified", "ai_vision"}` (new, +5 lines).
- `train.py::load_gt` and `evaluate.py::evaluate` now filter to
  `TRUSTED_SOURCES` before treating a row as ground truth (~10 lines changed
  across both).
- The existing 50-image / 51-point ground truth set is unaffected — it
  predates this bug and was collected through deliberate correction
  sessions, so it's already tagged `custom` correctly.

### 2b. Added honest held-out evaluation
**Before:** `evaluate.py` had one mode — fit and score on the exact same 50
images. No generalisation check existed.
**After:** `evaluate.py --holdout [--test-frac 0.3]` (new function
`holdout_evaluate`, +~40 lines) fits the geometry model on a random image
subset and scores only on images it never saw.

**Numbers — same model, two different questions asked of it:**
| Metric | Same-set (old, optimistic) | Held-out (new, honest) |
|---|---|---|
| Images | 50 fit / 50 scored | 35 fit / 15 scored |
| MAE (normalised) | 0.02079 | 0.02130 |
| PCK@10% | 97.5% | 95.7% |
| PCK@5% | 89.2% | 87.5% |
| PCK@2% | 62.9% | 62.5% |

The gap is small — the model isn't badly overfit on points 0–50 — but this
is the first time that's been *measured* rather than assumed.

### 2c. Palm-point (51–63) visual audit — first check ever
Not a code change. Rendered the model's current formula-based predictions on
20 images it had never touched (12 palmar, 4 dorsal, 4 flagged "irregular" in
the dataset metadata) and visually reviewed each. **Result: all 13 palm
points landed in anatomically plausible regions in every case — no failures
found.** This is new evidence (previously the 51–63 range had never been
checked against any real image), but it's a qualitative pass/fail, not new
pixel-level ground truth — see `RESEARCH_RECORD.md` for why no "corrected"
coordinates were produced from it.

## 3. Environment
**Before:** repo's `.venv` pointed at a path from before the project folder
was renamed and no longer existed — nothing was actually runnable.
**After:** rebuilt with Python 3.12, `mediapipe==0.10.21` pinned explicitly
(the current default `pip install mediapipe` resolves to `1.0.1`, which
removed the `mp.solutions.hands` API this whole codebase depends on).
Verified end-to-end: full `evaluate.py` run reproduces the exact original
baseline (MAE 0.02079, PCK@10 97.5%).

## 4. Net line-count summary
| File | Lines changed |
|---|---|
| `core/common.py` | +5 (TRUSTED_SOURCES constant) |
| `model/annotate.py` | ~+15 / relabeled (touched-tracking) |
| `model/train.py` | ~+8 (trusted-source filter, `only_filenames` param) |
| `model/evaluate.py` | ~+45 (trusted-source filter + `--holdout` mode) |
| `simulation/detect.py` | 0 (path-only change) |
| `web/*` | +850 new (new Flask app, not modifying existing logic) |
| `requirements.txt` | new file |

## Bottom line for your report
- **Accuracy:** unchanged — 0% delta, because the model file is identical.
- **Trustworthiness of the accuracy numbers:** meaningfully improved — the
  same-set metric is no longer circular, a held-out metric now exists, and a
  bug that could have silently corrupted future training data is fixed.
- **Usability:** meaningfully improved — cleaner project structure, a real
  web UI, pinned dependencies, a working environment.
- **What would actually move the accuracy number:** more verified ground
  truth, especially for points 51–63, which still have none. See
  `RESEARCH_RECORD.md` §7 and `HOW_TO_RUN.md` §5.
