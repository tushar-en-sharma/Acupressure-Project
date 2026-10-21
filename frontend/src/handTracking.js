import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

// Vendored by scripts/fetch-mediapipe-assets.sh into public/mediapipe/ so
// the app is fully self-hosted (same origin as everything else, no
// third-party runtime dependency).
const WASM_BASE = "/mediapipe/wasm";
const MODEL_PATH = "/mediapipe/models/hand_landmarker.task";

// MediaPipe's handedness labels assume a mirrored/selfie-style input frame
// — the same convention core/common.py's point definitions were built
// against on the Python side (same underlying model). This app feeds
// detect() the raw, unmirrored <video> element (mirroring is CSS-only, for
// display — see overlay.js/App.jsx), so the assumption doesn't hold and the
// label comes back backwards; flip it to correct. Confirmed via real camera
// test: palm/back was inverted (right hand's palm reported as "back").
const FLIP_HANDEDNESS = true;

// MediaPipe's default confidence (0.5) is loose enough to accept feet and
// animal paws as hands. Stricter detection/presence/tracking thresholds, plus
// a minimum handedness score per detected hand, reject those false positives.
const MIN_HAND_CONFIDENCE = 0.6;
const MIN_HANDEDNESS_SCORE = 0.8;
// A hand held close to the camera fills the frame, is often cut off at the
// edges and slightly blurred, so MediaPipe scores it lower even though it is
// plainly a hand. There is no distance limit: big hands get a relaxed score.
const MIN_HANDEDNESS_SCORE_CLOSE = 0.6;
const CLOSE_HAND_SPAN = 0.35;               // hand covers over 35% of the frame width or height

// Shape check: on a real hand the index/middle/ring fingers are about as long
// as the palm (measured on ~10,700 dataset hands: 1st percentile 0.7-0.8x the
// wrist-to-middle-knuckle distance). Toes on a foot or an animal paw are far
// shorter relative to the foot, so low ratios are rejected. Bone lengths are
// summed (so curled fingers still count) and measured in pixels, not
// normalised units, so the video's aspect ratio doesn't skew them.
const MIN_FINGER_PALM_RATIO = 0.65;
const FINGER_CHAINS = [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16]];

function looksLikeHand(landmarks, width, height) {
  const d = (a, b) => Math.hypot((landmarks[a].x - landmarks[b].x) * width, (landmarks[a].y - landmarks[b].y) * height);
  const palm = d(0, 9);
  if (!(palm > 0)) return false;
  const ratios = FINGER_CHAINS.map((c) => (d(c[0], c[1]) + d(c[1], c[2]) + d(c[2], c[3])) / palm);
  return ratios.reduce((a, b) => a + b, 0) / ratios.length >= MIN_FINGER_PALM_RATIO;
}

function flip(side) {
  if (side === "Left") return "Right";
  if (side === "Right") return "Left";
  return side;
}

// One-euro filter (Casiez et al.) — the same smoothing MediaPipe applies to
// hand landmarks natively: heavy smoothing while the hand is still (kills the
// jitter that makes dots dance, worst when the hand is close to the camera),
// almost none while it moves fast (so dots don't trail behind). Speeds are
// measured in hand-sizes per second, so the behaviour is the same near or far
// from the camera. BETA is lower than MediaPipe's default (80): in simulation
// that cut resting jitter ~70% instead of ~55%, for ~0.3% of frame width lag.
const MIN_CUTOFF = 0.05;
const BETA = 20;
const D_CUTOFF = 1;
const RESET_AFTER_MS = 400; // hand gone this long -> start fresh, don't glide in

const alpha = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));

class LandmarkSmoother {
  constructor() {
    this.prev = null; // { t, x: [[x,y]...], dx: [[dx,dy]...] }
  }

  apply(points, t) {
    const prev = this.prev;
    if (!prev || t - prev.t > RESET_AFTER_MS || t <= prev.t) {
      this.prev = { t, x: points.map((p) => [...p]), dx: points.map(() => [0, 0]) };
      return points;
    }
    const dt = (t - prev.t) / 1000;
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const size = (Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys)) / 2 || 1;
    const aD = alpha(D_CUTOFF, dt);
    const out = points.map((p, i) =>
      [0, 1].map((k) => {
        const rawD = (p[k] - prev.x[i][k]) / dt / size;
        const d = aD * rawD + (1 - aD) * prev.dx[i][k];
        prev.dx[i][k] = d;
        const a = alpha(MIN_CUTOFF + BETA * Math.abs(d), dt);
        return a * p[k] + (1 - a) * prev.x[i][k];
      })
    );
    this.prev = { t, x: out, dx: prev.dx };
    return out;
  }
}

let landmarkerPromise = null;

function createLandmarker(vision, delegate) {
  return HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_PATH, delegate },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: MIN_HAND_CONFIDENCE,
    minHandPresenceConfidence: MIN_HAND_CONFIDENCE,
    minTrackingConfidence: MIN_HAND_CONFIDENCE,
  });
}

// The first detection on a new landmarker compiles GPU shaders (a visible stall), so run one on a
// blank frame while nothing is on screen. Timestamp 1 keeps real frames (performance.now()) later.
function warmUp(landmarker) {
  try {
    const c = document.createElement("canvas");
    c.width = 256; c.height = 192;
    landmarker.detectForVideo(c, 1);
  } catch { /* the first real frame just pays the cost instead */ }
  return landmarker;
}

function loadLandmarker() {
  if (!landmarkerPromise) {
    // GPU is much faster, but isn't available in every mobile browser —
    // fall back to CPU instead of failing to start.
    landmarkerPromise = FilesetResolver.forVisionTasks(WASM_BASE).then((vision) =>
      createLandmarker(vision, "GPU").catch(() => createLandmarker(vision, "CPU"))
    ).then(warmUp);
    landmarkerPromise.catch(() => { landmarkerPromise = null; });
  }
  return landmarkerPromise;
}

/** Starts downloading and preparing the hand model in the background so it is ready when the camera
 * opens. Safe to call many times; failures are ignored (the camera start retries and reports them). */
export function preloadHandTracker() {
  loadLandmarker().catch(() => {});
}

/** One HandLandmarker instance shared across start/stop cycles — loading the
 * WASM runtime + model is the slow part, no need to redo it every time the
 * user restarts the camera. */
export async function createHandTracker() {
  const landmarker = await loadLandmarker();
  const smoothers = { Left: new LandmarkSmoother(), Right: new LandmarkSmoother() };
  return {
    /** Runs detection on the current video frame. Returns the exact payload
     * shape geometry.buildState expects: [{ side, landmarks: [[x,y], ...x21] }],
     * with landmarks smoothed over time per hand. */
    detect(video, timestampMs) {
      const result = landmarker.detectForVideo(video, timestampMs);
      // Work out each hand's side first. MediaPipe can label two hands the
      // same way (both "Right"); then the less confident one is given the
      // other side, so both hands are kept instead of one being dropped.
      const found = [];
      result.landmarks.forEach((landmarks, i) => {
        const top = result.handednesses[i]?.[0];
        const category = top?.categoryName;
        const side = FLIP_HANDEDNESS ? flip(category) : category;
        if (side !== "Left" && side !== "Right") return;
        const score = top?.score ?? 0;
        const xs = landmarks.map((p) => p.x), ys = landmarks.map((p) => p.y);
        const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
        if (score < (span >= CLOSE_HAND_SPAN ? MIN_HANDEDNESS_SCORE_CLOSE : MIN_HANDEDNESS_SCORE)) return;
        if (!looksLikeHand(landmarks, video.videoWidth || 1, video.videoHeight || 1)) return;
        found.push({ side, score, landmarks });
      });
      if (found.length === 2 && found[0].side === found[1].side) {
        const weaker = found[0].score < found[1].score ? found[0] : found[1];
        weaker.side = flip(weaker.side);
      }
      return found.map(({ side, landmarks }) => {
        const raw = landmarks.map((p) => [p.x, p.y]);
        return { side, landmarks: smoothers[side].apply(raw, timestampMs) };
      });
    },
  };
}
