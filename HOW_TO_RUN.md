# How to Run This Project

All commands run from the repo root (`Acupressure-Project/`) using the bundled
virtualenv. Do not use a bare `python3` — always prefix with `.venv/bin/`.

## 0. One-time setup (already done, kept here for reference)
```bash
/usr/local/bin/python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt          # core/model/simulation CLI tools
.venv/bin/pip install -r backend/requirements.txt  # + Django/DRF, for the web app's backend
```
Two version pins matter (both already pinned in `requirements.txt`):
- **Python 3.12**, not 3.13/3.14 — MediaPipe doesn't support them yet.
- **mediapipe==0.10.21**, not the default `pip install mediapipe` (currently
  1.0.1) — the newer major version removed the `mp.solutions.hands` API this
  codebase is built on.

The web app's frontend is a separate Node/React project — needs Node.js
(any recent LTS) and `npm`, installed independently of the Python venv; see
step 1 below.

## 1. Web app (recommended)
Django backend (camera + detection API) and React frontend (UI), run as two
separate dev servers, each in its own terminal.

**Backend** — first time only, install into the shared `.venv`:
```bash
.venv/bin/pip install -r backend/requirements.txt
```
Then, every time:
```bash
.venv/bin/python backend/manage.py runserver 8000
.venv/bin/python backend/manage.py runserver 8001                                          # different port
ACUPRESSURE_MODEL=model/weights/geometry_model_51pt.pkl .venv/bin/python backend/manage.py runserver 8000  # compare against v1
```
The web app serves the **latest model (v2 hybrid)** by default.
`ACUPRESSURE_MODEL` overrides it — `manage.py runserver` doesn't take custom
flags, so the model path is read from the environment instead.

**Frontend** — first time only:
```bash
cd frontend && npm install   # also fetches MediaPipe's WASM+model assets (~41MB, gitignored)
```
Then, every time:
```bash
cd frontend && npm run dev
```
Open `http://localhost:5173`. Press **Start Camera** — this asks *your
browser* for webcam access (not the backend's machine) and runs hand-landmark
detection client-side; only the 21 landmark points per hand are sent to the
Django backend, which resolves which acupressure points/problems are active.
This is what makes the app deployable to a real server (see "Deploying to
AWS" below) instead of only working when the backend happens to share a
machine with a webcam. Save snapshots downloads a JPEG straight from the
browser — no backend involved. The frontend calls the backend at
`http://localhost:8000` by default — change `frontend/.env` (`VITE_API_BASE`)
if you ran the backend on a different port.

## 1b. See the acupressure points on an image (no server)
```bash
.venv/bin/python simulation/detect.py --image dataset/Hands/Hand_0000002.jpg
```
Saves `Hand_0000002_acupressure.jpg` next to the source image — no display
needed. Shows only the 5 mapped acupressure points (Lu5, BL60, GV1, CV8, CV4),
whichever are valid for that hand's visible face (palm vs back).

## 2. Live webcam demo (bare OpenCV window)
```bash
.venv/bin/python simulation/detect.py
```
Needs a real display (opens an OpenCV window) — won't work over SSH.
`q` quit · `s` save the current frame.

## 3. See all 64 raw landmark points (debug view, not just the 5 acu-points)
There's no built-in flag for this yet; the annotator (step 5) shows all 64
points interactively, or ask for a one-off visualization script.

## 4. Measure accuracy
```bash
.venv/bin/python model/evaluate.py                            # same-set (optimistic) metrics
.venv/bin/python model/evaluate.py --holdout --test-frac 0.3   # honest held-out metrics
```
The `--holdout` version fits on a random subset of the annotated images and
scores only on images the model never saw — trust this number over the
plain one when judging real accuracy.

## 5. Add ground truth / improve accuracy (manual annotation)
```bash
.venv/bin/python model/annotate.py --only-acu     # focus on the 7 acu-related points
.venv/bin/python model/annotate.py                # full 64-point session
```
Needs a real display (Tk window). Only points you actually drag/nudge count
as verified ground truth — points left untouched are correctly excluded from
training. Controls are shown on-screen (`h` toggles the help overlay).

Points 51–63 (palm points, including 3 of the 5 clinical points: GV1, CV8,
CV4) currently have **zero** human-verified ground truth — this is the
highest-value place to annotate.

## 6. After annotating — refit and re-check
```bash
.venv/bin/python model/train.py
.venv/bin/python model/evaluate.py --holdout --test-frac 0.3
```

## 7. Second model (v2) — more accurate on points 21–50, kept alongside v1
```bash
.venv/bin/python model/train_v2.py     # refits + prints the v1-vs-v2 comparison table
```
Fits a ridge-regression alternative (whole-hand shape → point, instead of one
local bone → point) and keeps whichever is better **per point**, verified by
exact leave-one-out cross-validation. Result: mean LOO error on points 21–50
dropped from 0.0330 to 0.0110 (see `RESEARCH_RECORD.md` for the full table
and an important caveat about testing this on real webcam frames before
trusting it live — all training images are studio photos).

Saved to `model/weights/geometry_model_v2_hybrid.pkl`; the original
`geometry_model_51pt.pkl` is untouched. The CLI scripts accept `--model` and
the backend reads `ACUPRESSURE_MODEL` to pick which one to run. The web app
(and the deployed site) uses v2 by default; the CLI tools still default to v1:
```bash
.venv/bin/python simulation/detect.py --image dataset/Hands/Hand_0000002.jpg --model model/weights/geometry_model_v2_hybrid.pkl
.venv/bin/python model/evaluate.py --model model/weights/geometry_model_v2_hybrid.pkl
ACUPRESSURE_MODEL=model/weights/geometry_model_v2_hybrid.pkl .venv/bin/python backend/manage.py runserver 8000
```
Palm points 51–63 are unchanged in v2 — they still have zero ground truth,
so there was nothing for either model to learn there.

## Deploying to AWS

Every push to `main` deploys automatically (`.github/workflows/deploy.yml`):

1. runs the backend tests,
2. builds **one Docker image** — the React build + the Django API, served
   from the same origin by WhiteNoise, with the latest model (v2 hybrid),
3. pushes it to ECR (`acupressure-backend`, tagged with the commit SHA),
4. rolls it out on the EC2 instance over SSM (no SSH), where
   [Caddy](https://caddyserver.com) serves it at `https://<your subdomain>`
   with an automatically issued and renewed Let's Encrypt certificate.

The new container only replaces the old one once its health check passes, so
a broken build never takes the site down. GitHub authenticates to AWS with
OIDC — no AWS keys are stored in GitHub.

### One-time setup
```bash
./deploy/aws-setup.sh
```
This gives the instance a fixed Elastic IP, opens ports 80/443, and creates
the IAM role GitHub Actions deploys with (its ARN and the instance ID are set
in the workflow's `env:` block). Then:
1. add a DNS **A record** for your subdomain pointing at the printed Elastic IP,
2. set `APP_DOMAIN` in `.github/workflows/deploy.yml` to that subdomain and
   push. Until `APP_DOMAIN` is set, pushes build and push the image but don't
   touch the server.

### Redeploying
Push to `main`, or run the *Deploy* workflow manually from the Actions tab.
To roll back, re-run the *Deploy* workflow of an older commit.

### Local Docker run
```bash
docker build -t acupressure .
docker run --rm -p 8080:8080 -e DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1 acupressure
# open http://localhost:8080
```

## Known limitations (see RESEARCH_RECORD.md for full detail)
- Only 50 of 11,076 images have any ground truth; points 51–63 have none —
  true for both v1 and v2.
- v2's improvement is only cross-validated on studio-style photos (the 11k
  Hands dataset) — not yet confirmed on real webcam frames.
- No clinical validation of the point mappings — geometric placement only.
- `docs/metrics_latest.json` / `docs/metrics_latest_holdout.json` /
  `docs/metrics_v2_sameset.json` hold the most recent numbers.
- See `MODEL_DIFF.md` for exactly what changed vs. the last committed
  version.
