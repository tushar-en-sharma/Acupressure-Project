import { useEffect, useRef, useState } from "react";
import { detectHands, fetchInfo } from "./api";
import { createHandTracker } from "./handTracking";
import { drawOverlay, drawPlaceholderMessage } from "./overlay";
import ProblemPanel from "./components/ProblemPanel";
import MetricsBox from "./components/MetricsBox";

// Floor only, to avoid pegging the CPU beyond what the display can show —
// the actual rate is governed by how fast detect()+the backend round trip
// finish (the loop is fully serialized: it awaits the previous request
// before scheduling the next one), not by this number.
const DETECT_INTERVAL_MS = 16; // ~60/s ceiling

function getInitialTheme() {
  try {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // localStorage unavailable (private browsing, etc.) — fall through
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function App() {
  const [theme, setTheme] = useState(getInitialTheme);
  const [problems, setProblems] = useState([]);
  const [referenceViews, setReferenceViews] = useState([]);
  const [metrics, setMetrics] = useState({ mae_norm: null, pck10: null, fps: null });

  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);

  const [hands, setHands] = useState([]);
  const [liveProblems, setLiveProblems] = useState([]);
  const [selectedProblem, setSelectedProblem] = useState(null);
  const [section, setSection] = useState("acupressure"); // "acupressure" | "su_jok"
  const [detectRate, setDetectRate] = useState(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [infoError, setInfoError] = useState("");

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const trackerRef = useRef(null);
  const rafRef = useRef(null);
  const runningRef = useRef(false);
  const selectedProblemRef = useRef(null);
  const sectionRef = useRef("acupressure");
  const lastTickRef = useRef(0);
  const toastTimer = useRef(null);

  selectedProblemRef.current = selectedProblem;
  sectionRef.current = section;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("theme", theme);
    } catch {
      // localStorage unavailable — theme just won't persist across reloads
    }
  }, [theme]);

  function toggleTheme() {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }

  function loadInfo() {
    setInfoError("");
    fetchInfo()
      .then((data) => {
        setProblems(data.problems || []);
        setReferenceViews(data.reference_views || []);
        setMetrics(data.metrics || {});
      })
      .catch(() => {
        const base = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";
        setInfoError(
          "Could not reach the backend" + (base ? ` at ${base}` : "") +
            " — is it running? (see HOW_TO_RUN.md)"
        );
      });
  }

  useEffect(() => {
    loadInfo();
    return () => {
      clearTimeout(toastTimer.current);
      stopDetectionLoop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showToast(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3500);
  }

  function problemPointSet(name) {
    const pdf = problems.find((p) => p.name === name);
    if (!pdf) return null;
    const out = new Set();
    pdf.protocols.forEach((protocol) => protocol.points.forEach((pt) => out.add(pt)));
    return out;
  }

  function stopDetectionLoop() {
    runningRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }

  async function detectionLoop() {
    if (!runningRef.current) return;
    const now = performance.now();
    if (now - lastTickRef.current >= DETECT_INTERVAL_MS) {
      const interval = now - lastTickRef.current;
      lastTickRef.current = now;
      if (interval < 2000) setDetectRate(Math.round(1000 / interval));

      const video = videoRef.current;
      if (video && video.readyState >= 2 && trackerRef.current) {
        const handsIn = trackerRef.current.detect(video, now);
        try {
          const state = await detectHands(handsIn);
          if (!runningRef.current) return;
          setHands(state.hands || []);
          setLiveProblems(state.problems || []);
          renderOverlay(state.hands || [], state.active_points || []);
        } catch {
          // transient network hiccup — try again next tick
        }
      }
    }
    rafRef.current = requestAnimationFrame(detectionLoop);
  }

  function renderOverlay(handsNow, pointsNow) {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || !video.videoWidth) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");

    if (!handsNow.length) {
      drawPlaceholderMessage(ctx, canvas.width, canvas.height, "Show your hand to the camera");
      return;
    }

    // A selected problem shows just its points; otherwise show the points of
    // the open section only (Su Jok adds many joint points that would bury
    // the classical ones, and vice versa).
    const wanted = selectedProblemRef.current ? problemPointSet(selectedProblemRef.current) : null;
    const suJok = sectionRef.current === "su_jok";
    const visible = wanted
      ? pointsNow.filter((p) => wanted.has(p.label))
      : pointsNow.filter((p) => (p.system === "su_jok") === suJok);
    drawOverlay(ctx, canvas.width, canvas.height, visible);
  }

  async function handleSelectProblem(name) {
    setSelectedProblem((prev) => (prev === name ? null : name));
  }

  async function handleStart() {
    setError("");
    setStarting(true);
    try {
      // 720p is unnecessarily heavy input for the hand-landmark model — it
      // has to resize every frame down to its own input size regardless, so
      // a smaller capture resolution cuts that per-frame cost with no real
      // accuracy loss for hand tracking. Snapshot quality is unaffected
      // (still captured from this same stream, just at 640x480 instead).
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, frameRate: { ideal: 30 } },
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      trackerRef.current = await createHandTracker();

      runningRef.current = true;
      lastTickRef.current = 0;
      setRunning(true);
      rafRef.current = requestAnimationFrame(detectionLoop);
    } catch (err) {
      setError(
        err?.name === "NotAllowedError"
          ? "Camera permission was denied — allow camera access and try again."
          : "Could not start the camera: " + (err?.message || err)
      );
      handleStop();
    } finally {
      setStarting(false);
    }
  }

  function handleStop() {
    stopDetectionLoop();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setRunning(false);
    setHands([]);
    setLiveProblems([]);
    setDetectRate(null);
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
  }

  function handleSnapshot() {
    const video = videoRef.current;
    const overlayCanvas = canvasRef.current;
    if (!video || !video.videoWidth) return;

    const out = document.createElement("canvas");
    out.width = video.videoWidth;
    out.height = video.videoHeight;
    const ctx = out.getContext("2d");
    // Video is mirrored on screen via CSS (see .video-stage video in
    // index.css) — flip the canvas transform to match when drawing its raw
    // (unmirrored) pixels. The overlay canvas already draws in mirrored
    // coordinates directly (see overlay.js), matching what's on screen, so
    // it's drawn as-is without a second flip.
    ctx.save();
    ctx.translate(out.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, out.width, out.height);
    ctx.restore();
    ctx.drawImage(overlayCanvas, 0, 0, out.width, out.height);

    const url = out.toDataURL("image/jpeg", 0.9);
    const a = document.createElement("a");
    a.href = url;
    a.download = `acupressure_${Date.now()}.jpg`;
    a.click();
    showToast("Snapshot saved to your downloads");
  }

  const badgeText = metrics.mae_norm != null
    ? `Baseline: MAE ${metrics.mae_norm.toFixed(3)} · PCK@10 ${metrics.pck10}% · ${metrics.fps} FPS`
    : "Model metrics unavailable";
  const statusText = hands.length
    ? hands.map((h) => `${h.side} hand · ${h.facing}`).join("  |  ")
    : "No hand detected";

  const liveByName = new Map(liveProblems.map((p) => [p.name, p]));

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
              <path d="M2.5 12.5h4.3l1.8-3.6 2.4 6.8 2-4.4 1.3 2.2h5.2"
                stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div>
            <h1>Acupressure Hand Guide</h1>
            <p>Clinical hand-point mapping, tracked live from your camera</p>
          </div>
        </div>
        <div className="topbar-actions">
          <div className={`badge${metrics.mae_norm == null ? " badge-muted" : ""}`}>{badgeText}</div>
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <circle cx="12" cy="12" r="4.5" />
                <path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M20.5 14.7A8.5 8.5 0 0 1 9.3 3.5a.75.75 0 0 0-.9-1 10 10 0 1 0 13.1 13.1.75.75 0 0 0-1-.9z" />
              </svg>
            )}
            <span>{theme === "dark" ? "Light" : "Dark"}</span>
          </button>
        </div>
      </header>

      {infoError && (
        <div className="banner-error">
          {infoError}
          <button className="btn btn-ghost" onClick={loadInfo}>Retry</button>
        </div>
      )}

      <main className="layout">
        <section className="panel video-panel">
          <div className="video-frame">
            <div className="video-stage" style={{ display: running ? "block" : "none" }}>
              <video ref={videoRef} muted playsInline />
              <canvas ref={canvasRef} />
            </div>
            {!running && (
              <div className="placeholder">
                <svg className="placeholder-icon" viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M3 7h3l1.5-2h9L18 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" strokeLinejoin="round" />
                  <circle cx="12" cy="13" r="3.5" />
                </svg>
                <p>Camera is off</p>
                <p className="muted">Press <strong>Start Camera</strong> to begin detection</p>
              </div>
            )}
            {running && <div className="status-pill">{statusText}</div>}
          </div>

          <div className="controls">
            <button className="btn btn-primary" disabled={starting || running} onClick={handleStart}>
              Start Camera
            </button>
            <button className="btn btn-secondary" disabled={!running} onClick={handleStop}>
              Stop
            </button>
            <button className="btn btn-ghost" disabled={!running} onClick={handleSnapshot}>
              Save Snapshot
            </button>
            {running && detectRate != null && <span className="fps">{detectRate} fps</span>}
          </div>
          {error && <p className="error-msg">{error}</p>}
          {toast && <div className="toast">{toast}</div>}

          <div className="status-block">
            <p className="live-status-text">
              {running
                ? "Camera is live — hold your hand steady in frame."
                : "Start the camera to begin detecting hand-points."}
            </p>
            <MetricsBox metrics={metrics} />
          </div>
        </section>

        <section className="panel problems-panel">
          <div className="sidebar-head">
            <h2>Solve a Problem</h2>
            <p className="muted">
              Tap a problem &mdash; the point(s) that solve it light up on your hand as you find
              them.
            </p>
          </div>
          <ProblemPanel
            problems={problems}
            views={referenceViews}
            section={section}
            onSectionChange={setSection}
            liveByName={liveByName}
            selected={selectedProblem}
            onSelect={handleSelectProblem}
            live={running}
          />
        </section>
      </main>

      <footer className="footer">
        <p>Browser MediaPipe 21 keypoints &rarr; learned geometry model &rarr; 64-point hand &rarr; orientation-aware acupressure overlay.</p>
        <p className="disclaimer">
          For general wellness guidance only &mdash; not a substitute for professional medical advice, diagnosis, or treatment.
        </p>
      </footer>
    </>
  );
}
