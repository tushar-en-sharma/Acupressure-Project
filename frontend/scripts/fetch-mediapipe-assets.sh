#!/usr/bin/env bash
# Vendors the MediaPipe hand-landmark WASM runtime + model into public/, so
# the built app is fully self-hosted (served from the same S3/CloudFront
# origin as everything else, no third-party runtime dependency or CORS
# surface at runtime). Not committed to git (~41MB) — run this once after
# `npm install`, and again whenever @mediapipe/tasks-vision is upgraded.
set -euo pipefail
cd "$(dirname "$0")/.."

WASM_SRC="node_modules/@mediapipe/tasks-vision/wasm"
OUT_WASM="public/mediapipe/wasm"
OUT_MODELS="public/mediapipe/models"
MODEL_URL="https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"

if [ ! -d "$WASM_SRC" ]; then
  echo "error: $WASM_SRC not found — run 'npm install' first" >&2
  exit 1
fi

mkdir -p "$OUT_WASM" "$OUT_MODELS"
cp "$WASM_SRC"/*.wasm "$WASM_SRC"/*.js "$OUT_WASM/"
curl -sL --fail -o "$OUT_MODELS/hand_landmarker.task" "$MODEL_URL"

echo "Vendored MediaPipe assets into $OUT_WASM and $OUT_MODELS"
