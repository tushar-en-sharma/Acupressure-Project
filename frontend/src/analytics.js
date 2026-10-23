// Anonymous usage events. Nothing is recorded or sent until the user taps Allow in the
// consent prompt. Events go to Revive's own server (shown in the admin "App stats" tab)
// and to Google Analytics. Only app choices and coarse device info are sent: never
// names, phone numbers, IP addresses, camera frames or hand landmarks.
import site from "./site";

const CONSENT_KEY = "revive-app-consent";
const GA_ID = "G-T5C2EK35HL";
const ENDPOINT = import.meta.env.VITE_STATS_URL ?? (import.meta.env.DEV ? "http://localhost:3001/api/app-events" : `${site.siteUrl}/api/app-events`);

// Where the optional star rating goes (same server as the usage events).
export const FEEDBACK_ENDPOINT = ENDPOINT.replace(/app-events$/, "app-feedback");
// The anonymous id is shared with feedback only if the user allowed statistics.
export const anonId = () => (hasConsent() ? stored(localStorage, "revive-app-vid") : "");

export const getConsent = () => { try { return localStorage.getItem(CONSENT_KEY); } catch { return null; } };
export const hasConsent = () => getConsent() === "yes";

function loadGA() {
  if (window.__ga) return;
  window.__ga = true;
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", GA_ID, { anonymize_ip: true });
}

// Call once at start: if the user already allowed statistics, start Google Analytics.
export function initAnalytics() { if (hasConsent()) loadGA(); }

export function setConsent(value) {
  try { localStorage.setItem(CONSENT_KEY, value); } catch { /* choice just will not persist */ }
  if (value === "yes") loadGA();
  else { try { localStorage.removeItem("revive-app-vid"); localStorage.removeItem("revive-app-src"); } catch { /* ignore */ } }
}

const rand = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}${Math.random().toString(16).slice(2)}`).toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 36);
function stored(store, key) {
  try { let v = store.getItem(key); if (!v) { v = rand(); store.setItem(key, v); } return v; } catch { return ""; }
}

function firstSource() {
  try {
    const saved = localStorage.getItem("revive-app-src");
    if (saved) return saved;
    const p = new URLSearchParams(window.location.search);
    let s = p.get("utm_source") || "";
    if (s && p.get("utm_medium")) s += `/${p.get("utm_medium")}`;
    if (!s && document.referrer) {
      const h = new URL(document.referrer).hostname.replace(/^www\./, "");
      if (h && h !== window.location.hostname) s = h;
    }
    s = (s || "direct").toLowerCase().slice(0, 60);
    localStorage.setItem("revive-app-src", s);
    return s;
  } catch { return ""; }
}

// Coarse system and browser names only (no versions, no full user-agent).
function system() {
  const ua = navigator.userAgent || "";
  const os = /Android/.test(ua) ? "android" : /iPhone|iPad|iPod/.test(ua) ? "ios" : /Windows/.test(ua) ? "windows" : /Mac OS X/.test(ua) ? "mac" : /Linux/.test(ua) ? "linux" : "";
  const browser = /Edg\//.test(ua) ? "edge" : /OPR\//.test(ua) ? "opera" : /SamsungBrowser/.test(ua) ? "samsung" : /Chrome\//.test(ua) ? "chrome" : /Firefox\//.test(ua) ? "firefox" : /Safari\//.test(ua) ? "safari" : "";
  return { os, browser };
}
const screenBucket = () => (window.innerWidth < 420 ? "xs" : window.innerWidth < 768 ? "sm" : window.innerWidth < 1100 ? "md" : "lg");

const AREA = {
  "Su Jok: Headache": "head_neck", "Su Jok: Sore Throat": "head_neck", "Su Jok: Neck Pain": "head_neck",
  "Su Jok: Cough / Bronchitis": "chest_stomach", "Su Jok: Palpitations": "chest_stomach",
  "Su Jok: Acidity / Indigestion": "chest_stomach", "Su Jok: Constipation": "chest_stomach",
  "Su Jok: Menstrual / Bladder Discomfort": "chest_stomach",
  "Su Jok: Upper Back Pain": "back", "Su Jok: Lower Back Pain": "back",
  "Su Jok: Shoulder Pain": "arms_legs", "Su Jok: Elbow Pain": "arms_legs", "Su Jok: Wrist Pain": "arms_legs",
  "Su Jok: Hip Pain": "arms_legs", "Su Jok: Knee Pain": "arms_legs", "Su Jok: Ankle Sprain": "arms_legs",
  "Su Jok: Cold / Blocked Nose / Sinus": "head_neck",
  "Su Jok: Dizziness": "head_neck",
  "Su Jok: Hoarse Voice / Voice Strain": "head_neck",
  "Su Jok: Chest Congestion": "chest_stomach",
  "Su Jok: Breathing Discomfort": "chest_stomach",
  "Su Jok: Nausea": "chest_stomach",
  "Su Jok: Loss of Appetite": "chest_stomach",
  "Su Jok: Gas / Bloating": "chest_stomach",
  "Su Jok: Stomach Cramps": "chest_stomach",
  "Su Jok: Loose Motions": "chest_stomach",
  "Su Jok: Period Pain": "chest_stomach",
  "Su Jok: Urinary Discomfort": "chest_stomach",
  "Su Jok: General Backache": "back",
  "Su Jok: Sciatica-type Leg Pain": "back",
};

// "Su Jok: Knee Pain" -> "knee_pain"
export const problemKey = (name) => (name || "").replace(/^Su Jok:\s*/, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
export const areaOf = (name) => AREA[name] || "other";

export function track(name, params = {}) {
  try {
    if (!hasConsent()) return;
    const vid = stored(localStorage, "revive-app-vid");
    const sid = stored(sessionStorage, "revive-app-sid");
    if (!vid || !sid) return;
    const body = JSON.stringify({
      vid, sid, name, props: params, source: firstSource(), device: deviceType(), ...system(), screen: screenBucket(), lang: document.documentElement.lang,
    });
    if (navigator.sendBeacon) navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
    else fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
    if (typeof window.gtag === "function") window.gtag("event", name, params);
    if (import.meta.env.DEV) console.debug("[track]", name, params);
  } catch {
    // analytics must never break the app
  }
}

export const deviceType = () => (window.matchMedia?.("(pointer: coarse)").matches ? "touch" : "mouse");
