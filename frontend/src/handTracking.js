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

function flip(side) {
  if (side === "Left") return "Right";
  if (side === "Right") return "Left";
  return side;
}

let landmarkerPromise = null;

function loadLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = FilesetResolver.forVisionTasks(WASM_BASE).then((vision) =>
      HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_PATH, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 2,
      })
    );
  }
  return landmarkerPromise;
}

/** One HandLandmarker instance shared across start/stop cycles — loading the
 * WASM runtime + model is the slow part, no need to redo it every time the
 * user restarts the camera. */
export async function createHandTracker() {
  const landmarker = await loadLandmarker();
  return {
    /** Runs detection on the current video frame. Returns the exact payload
     * shape POST /api/detect/ expects: [{ side, landmarks: [[x,y], ...x21] }]. */
    detect(video, timestampMs) {
      const result = landmarker.detectForVideo(video, timestampMs);
      const hands = [];
      result.landmarks.forEach((landmarks, i) => {
        const category = result.handednesses[i]?.[0]?.categoryName;
        const side = FLIP_HANDEDNESS ? flip(category) : category;
        if (side !== "Left" && side !== "Right") return;
        hands.push({ side, landmarks: landmarks.map((p) => [p.x, p.y]) });
      });
      return hands;
    },
  };
}
