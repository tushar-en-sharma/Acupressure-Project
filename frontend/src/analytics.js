// Anonymous usage events for Google Analytics 4 (gtag is loaded in index.html).
// Only app choices are sent: never names, contact details, camera frames or
// landmarks. GA assigns its own anonymous client id; there is no user id.
const AREA = {
  "Su Jok: Headache": "head_neck", "Su Jok: Sore Throat": "head_neck", "Su Jok: Neck Pain": "head_neck",
  "Su Jok: Cough / Bronchitis": "chest_stomach", "Su Jok: Palpitations": "chest_stomach",
  "Su Jok: Acidity / Indigestion": "chest_stomach", "Su Jok: Constipation": "chest_stomach",
  "Su Jok: Menstrual / Bladder Discomfort": "chest_stomach",
  "Su Jok: Upper Back Pain": "back", "Su Jok: Lower Back Pain": "back",
  "Su Jok: Shoulder Pain": "arms_legs", "Su Jok: Elbow Pain": "arms_legs", "Su Jok: Wrist Pain": "arms_legs",
  "Su Jok: Hip Pain": "arms_legs", "Su Jok: Knee Pain": "arms_legs", "Su Jok: Ankle Sprain": "arms_legs",
};

// "Su Jok: Knee Pain" -> "knee_pain"
export const problemKey = (name) => (name || "").replace(/^Su Jok:\s*/, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
export const areaOf = (name) => AREA[name] || "other";

export function track(name, params = {}) {
  try {
    if (typeof window.gtag === "function") window.gtag("event", name, params);
    if (import.meta.env.DEV) console.debug("[track]", name, params);
  } catch {
    // analytics must never break the app
  }
}

export const deviceType = () => (window.matchMedia?.("(pointer: coarse)").matches ? "touch" : "mouse");
