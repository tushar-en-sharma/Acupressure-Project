# Hand Acupressure Point Simulation

Real-time detection and video simulation of **5 acupressure points** on the hand
from a webcam. MediaPipe (21 keypoints) → learned geometry model → 64-point hand
→ orientation-aware acupressure overlay.

**Step-by-step run instructions (setup, web app, demo, training):** see [`HOW_TO_RUN.md`](HOW_TO_RUN.md).
**Full documentation, methodology, and results:** see [`RESEARCH_RECORD.md`](RESEARCH_RECORD.md).

## Quick start

**Web app** (recommended) — a real UI in your browser: live video, a sidebar
that lights up each acupressure point as it's detected, snapshots, model stats.
Django (backend) + React (frontend), run as two dev servers:
```bash
# Terminal 1 — backend (Django + DRF), the camera/detection API on :8000
.venv/bin/pip install -r backend/requirements.txt
.venv/bin/python backend/manage.py runserver 8000

# Terminal 2 — frontend (React + Vite), the UI on :5173
cd frontend && npm install && npm run dev
```
Open `http://localhost:5173`. The React app talks to the Django API at
`http://localhost:8000` (configurable via `frontend/.env` → `VITE_API_BASE`).

**Bare simulation** — the original OpenCV window, no browser needed:
```bash
.venv/bin/python simulation/detect.py                       # live webcam demo
.venv/bin/python simulation/detect.py --image dataset/Hands/Hand_0000002.jpg
```

## Improve model accuracy (annotate → train → evaluate)
```bash
.venv/bin/python model/annotate.py        # correct model-seeded points on more images
.venv/bin/python model/train.py           # refit the geometry model on new ground truth
.venv/bin/python model/evaluate.py        # measure accuracy (MAE / RMSE / PCK / FPS)
```
The annotator pre-places every point from the current model, so you only *nudge*
what's wrong. It's also the only way to add ground truth for palm points 51–63.
Each cycle measurably improves the model.

**Second model (v2, optional)** — a ridge-regression alternative that's kept
per-point alongside the original whenever it scores lower on leave-one-out
error (see `HOW_TO_RUN.md` step 7 for the full picture, including an important
caveat about it only being validated on studio photos so far):
```bash
.venv/bin/python model/train_v2.py                                            # writes weights/geometry_model_v2_hybrid.pkl
.venv/bin/python model/evaluate.py --model model/weights/geometry_model_v2_hybrid.pkl
ACUPRESSURE_MODEL=model/weights/geometry_model_v2_hybrid.pkl .venv/bin/python backend/manage.py runserver 8000
```

## Layout
| Path | What |
|------|------|
| `backend/` | **API server** — Django + Django REST Framework (`config/` project, `detector/` app: camera lifecycle, MJPEG stream, JSON state/points/metrics endpoints) |
| `frontend/` | **Web UI** — React + Vite (`src/App.jsx` + components), talks to `backend/` over HTTP/CORS |
| `simulation/` | **Live demo** — `detect.py`, the bare OpenCV webcam/image window |
| `model/` | **Model tooling** — `annotate.py`, `train.py`, `train_v2.py` (ridge-regression alternative), `evaluate.py`, and `weights/` (the trained `.pkl` files) |
| `core/` | Shared engine (`common.py`) that backend, simulation, and model all import — the single source of truth for the geometry pipeline |
| `dataset/` | 11,076 hand images + `HandInfo.csv` |
| `annotations/ground_truth_64pt.csv` | master ground truth (grows via annotator) |
| `docs/` | metrics JSON + archived original reports |
| `snapshots/` | saved frames from the web app |

## The 5 points
Lu5 (Chronic Bronchitis, palm) · BL60 (Sciatica, back) · GV1 (Back Stiffness, back)
· CV8 (Constipation, palm) · CV4 (Headache, palm).

Baseline accuracy (v1 model): **MAE 0.0208 (norm), PCK@10 97.5%, ~54 FPS.**
The optional v2 hybrid model (`model/train_v2.py`) improves same-set MAE on
points 21–50 to **0.0114** — see `RESEARCH_RECORD.md` for the honest,
held-out numbers and the studio-photos-only caveat before trusting it live.
