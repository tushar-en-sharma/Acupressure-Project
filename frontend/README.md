# Frontend — Acupressure Hand Detector

React (Vite) UI for the hand-acupressure web app. Talks to the Django backend
in `../backend/` over HTTP (see `src/api.js`) — start that first.

See the repo root [`README.md`](../README.md) and [`HOW_TO_RUN.md`](../HOW_TO_RUN.md)
for full setup and run instructions. Quick version:

```bash
npm install
npm run dev          # http://localhost:5173, expects the backend on :8000
```

`VITE_API_BASE` in `.env` controls which backend URL the app calls (defaults
to `http://localhost:8000`).

## Layout
| Path | What |
|------|------|
| `src/App.jsx` | Top-level component — camera controls, polling, layout |
| `src/api.js` | Thin fetch wrapper around the backend's `/api/*` endpoints |
| `src/components/` | `PointsList`, `MetricsBox` — presentational pieces of the sidebar |
| `src/index.css` | All styling (plain CSS, no framework) |
