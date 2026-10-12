// `??` (not `||`) matters here: VITE_API_BASE="" is a deliberate choice
// (same-origin relative paths, e.g. behind an nginx reverse proxy) and
// must NOT fall back to the localhost default — only a genuinely unset
// env var should.
const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

async function getJSON(path) {
  const res = await fetch(`${API_BASE}${path}`);
  return res.json();
}

async function postJSON(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return res.json();
}

export const fetchInfo = () => getJSON("/api/info/");

/** hands: [{ side: "Left"|"Right", landmarks: [[x,y], ...x21] }] — the
 * client-side MediaPipe detection result (see handTracking.js) for the
 * current video frame. Returns { hands, active_points, problems }. */
export const detectHands = (hands) => postJSON("/api/detect/", { hands });
