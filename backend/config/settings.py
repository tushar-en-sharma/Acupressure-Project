"""
Django settings for the Acupressure Hand-Point backend.
"""

import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent          # backend/
REPO_ROOT = BASE_DIR.parent                                 # repo root

# core/ (shared geometry engine), model/, simulation/ all live at the repo
# root, one level above backend/ — put the root on sys.path so
# `from core import common as C` works the same way it does everywhere else.
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

# All of these default to the original local-dev values when unset, so
# `manage.py runserver` still works with zero configuration — the deployed
# container (see Dockerfile) sets real values via environment variables.
SECRET_KEY = os.environ.get(
    "DJANGO_SECRET_KEY",
    "django-insecure-e=8f4xk93=tb**qobso$ro2n3vk6pdn@mqpw7g3ka7ra&5w=87",
)
DEBUG = os.environ.get("DJANGO_DEBUG", "true").lower() == "true"
ALLOWED_HOSTS = [
    h.strip() for h in os.environ.get("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if h.strip()
]

# DRF's default permission/auth machinery expects the standard auth stack
# (Permission/ContentType models) to be installed, even though this project
# has no users or admin site of its own.
INSTALLED_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "detector",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {"context_processors": []},
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# No app models of our own and every request is stateless — sqlite is here
# only because django.contrib.contenttypes (required by DRF's internals)
# expects a database to exist; it's never actually queried by our views.
# Path is overridable for read-only filesystems (point DJANGO_DB_PATH at a
# writable location such as /tmp).
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": os.environ.get("DJANGO_DB_PATH", str(BASE_DIR / "db.sqlite3")),
    }
}

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"

# Production serves the built React app (frontend/dist, copied into the
# image by the Dockerfile) from this same Django process via WhiteNoise, so
# the frontend and /api/ share one origin — no CORS, one container to deploy.
# Vite fingerprints everything under /assets/, so those are cached forever.
FRONTEND_DIST = Path(os.environ.get("FRONTEND_DIST", str(REPO_ROOT / "frontend" / "dist")))
if FRONTEND_DIST.is_dir():
    WHITENOISE_ROOT = str(FRONTEND_DIST)
    WHITENOISE_INDEX_FILE = True
    WHITENOISE_IMMUTABLE_FILE_TEST = lambda path, url: url.startswith("/assets/")

    # The hand model and MediaPipe runtime (~20 MB) never change between releases, so let
    # browsers keep them for 30 days instead of re-checking every minute.
    def _long_cache_models(headers, path, url):
        if url.startswith("/mediapipe/"):
            headers["Cache-Control"] = "public, max-age=2592000"

    WHITENOISE_ADD_HEADERS_FUNCTION = _long_cache_models

# Behind the Caddy reverse proxy on the server (see deploy/remote-deploy.sh),
# which terminates HTTPS and forwards X-Forwarded-Proto.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
CSRF_TRUSTED_ORIGINS = [f"https://{h}" for h in ALLOWED_HOSTS if h not in ("*", "localhost", "127.0.0.1")]

# Vite dev server origin — React talks to this API cross-origin. Vite picks
# the next free port when 5173 is already taken by something else on the
# machine (5174, 5175, ...), so allow any localhost port in dev rather than
# one hardcoded value. Production is same-origin and needs no CORS at all;
# DJANGO_CORS_ORIGINS is there if the API is ever called from another site.
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^http://localhost:\d+$",
    r"^http://127\.0\.0\.1:\d+$",
]
CORS_ALLOWED_ORIGINS = [
    o.strip() for o in os.environ.get("DJANGO_CORS_ORIGINS", "").split(",") if o.strip()
]

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
