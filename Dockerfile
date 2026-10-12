# One image serves the whole app: the React build (static, via WhiteNoise)
# and the Django detect API, same origin. Built and pushed to ECR by
# .github/workflows/deploy.yml, then run on EC2 behind Caddy (HTTPS).

# ── Stage 1: build the React frontend ────────────────────────────────────────
FROM node:24-bookworm-slim AS frontend
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
COPY frontend/scripts scripts
RUN npm ci
COPY frontend/ ./
# postinstall above vendored MediaPipe's WASM + hand model into public/
RUN npm run build

# ── Stage 2: Python runtime ──────────────────────────────────────────────────
FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

WORKDIR /app

COPY backend/requirements-prod.txt backend/requirements-prod.txt
RUN pip install --no-cache-dir -r backend/requirements-prod.txt

# core/ (geometry pipeline), the latest trained model and docs/ (metrics
# shown in the UI) live outside backend/ but are imported/read by it — see
# backend/config/settings.py's sys.path insert.
COPY core core
COPY model/weights/geometry_model_v2_hybrid.pkl model/weights/
COPY docs/*.json docs/
COPY backend backend
COPY --from=frontend /frontend/dist frontend/dist

# Serve the latest model (v2 hybrid) — the only one shipped in the image.
ENV ACUPRESSURE_MODEL=/app/model/weights/geometry_model_v2_hybrid.pkl \
    DJANGO_DEBUG=false

RUN useradd --system --no-create-home app
USER app

WORKDIR /app/backend
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/api/info/', timeout=4)" || exit 1

CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8080", \
     "--workers", "2", "--threads", "4", "--timeout", "60", "--access-logfile", "-"]
