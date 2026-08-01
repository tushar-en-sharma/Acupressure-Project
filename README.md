# Hand Acupressure Point Simulation

Real-time detection and video simulation of **5 acupressure points** on the hand
from a webcam. MediaPipe (21 keypoints) → learned geometry model → 64-point hand
→ orientation-aware acupressure overlay.

**Full documentation, methodology, and results:** see [`RESEARCH_RECORD.md`](RESEARCH_RECORD.md).

## Quick start
```bash
.venv/bin/python src/detect.py            # live webcam demo
.venv/bin/python src/detect.py --image dataset/Hands/Hand_0000002.jpg
```

## Improve model accuracy (annotate → train → evaluate)
```bash
.venv/bin/python src/annotate.py          # correct model-seeded points on more images
.venv/bin/python src/train.py             # refit the geometry model on new ground truth
.venv/bin/python src/evaluate.py          # measure accuracy (MAE / RMSE / PCK / FPS)
```
The annotator pre-places every point from the current model, so you only *nudge*
what's wrong. It's also the only way to add ground truth for palm points 51–63.
Each cycle measurably improves the model.

## Layout
| Path | What |
|------|------|
| `dataset/` | 11,076 hand images + `HandInfo.csv` |
| `annotations/ground_truth_64pt.csv` | master ground truth (grows via annotator) |
| `models/geometry_model_51pt.pkl` | active model |
| `src/` | `common.py` (shared), `annotate.py`, `train.py`, `evaluate.py`, `detect.py` |
| `docs/` | metrics JSON + archived original reports |

## The 5 points
Lu5 (Chronic Bronchitis, palm) · BL60 (Sciatica, back) · GV1 (Back Stiffness, back)
· CV8 (Constipation, palm) · CV4 (Headache, palm).

Baseline accuracy: **MAE 0.0208 (norm), PCK@10 97.5%, ~54 FPS.**
