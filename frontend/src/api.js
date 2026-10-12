// `??` (not `||`) matters here: VITE_API_BASE="" is a deliberate choice
// (same-origin relative paths, e.g. behind an nginx reverse proxy) and
// must NOT fall back to the localhost default — only a genuinely unset
// env var should.
const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

async function getJSON(path) {
  const res = await fetch(`${API_BASE}${path}`);
  return res.json();
}

export const fetchInfo = () => getJSON("/api/info/");

