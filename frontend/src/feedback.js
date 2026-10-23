// Optional "how was it?" prompt shown after the camera, only some of the time.
// Chance is higher when the user found their point; it never shows twice in a session,
// and not again for two weeks once they have answered or skipped it.
import { FEEDBACK_ENDPOINT, anonId, deviceType } from "./analytics";

const LAST_KEY = "revive-app-feedback-at";
const SESSION_KEY = "revive-app-feedback-session";
const COOLDOWN_MS = 14 * 864e5;
const MIN_SECONDS = 6;

export function shouldAskFeedback({ found, seconds }) {
  try {
    if (seconds < MIN_SECONDS) return false;
    if (sessionStorage.getItem(SESSION_KEY)) return false;
    const last = Number(localStorage.getItem(LAST_KEY) || 0);
    if (last && Date.now() - last < COOLDOWN_MS) return false;
    return Math.random() < (found ? 0.5 : 0.3);
  } catch { return false; }
}

// Call when the prompt is shown, so it is not asked twice in one session.
export function markFeedbackAsked() {
  try { sessionStorage.setItem(SESSION_KEY, "1"); } catch { /* ignore */ }
}
// Call when the user sent or skipped it, to start the two-week pause.
export function markFeedbackDone() {
  try { localStorage.setItem(LAST_KEY, String(Date.now())); } catch { /* ignore */ }
}

export async function sendFeedback({ rating, comment, problem, found, lang }) {
  const r = await fetch(FEEDBACK_ENDPOINT, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rating, comment, problem, found: found ? 1 : 0, lang, device: deviceType(), vid: anonId() }),
  });
  if (!r.ok) throw new Error("feedback failed");
}
