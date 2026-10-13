import { useEffect, useRef, useState } from "react";
import { fetchInfo } from "./api";
import { buildState } from "./geometry";
import { createHandTracker } from "./handTracking";
import { drawOverlay } from "./overlay";
import ProblemList from "./components/ProblemList";
import ProblemDetail from "./components/ProblemDetail";

// Which point systems the app offers. Classical acupressure is hidden for
// now — add "hand_acupoint" / "hand_reflex" back here to show it again.
const VISIBLE_SYSTEMS = new Set(["su_jok"]);

function getInitialTheme() {
  try {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // localStorage unavailable (private browsing, etc.) — fall through
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function problemFromUrl() {
  return new URLSearchParams(window.location.search).get("problem");
}

export default function App() {
  const [theme, setTheme] = useState(getInitialTheme);
  const [problems, setProblems] = useState([]);
  const [referenceViews, setReferenceViews] = useState([]);
  const [engine, setEngine] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState(problemFromUrl);

  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [live, setLive] = useState({ hands: [], found: [], complete: false });
  const [videoAspect, setVideoAspect] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const trackerRef = useRef(null);
  const rafRef = useRef(null);
  const runningRef = useRef(false);
  const engineRef = useRef(null);
  const problemRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);
  const lastUiRef = useRef("");

  const visibleProblems = problems.filter((p) => VISIBLE_SYSTEMS.has(p.system));
  const problem = visibleProblems.find((p) => p.name === selected) || null;
  problemRef.current = problem;
  engineRef.current = engine;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("theme", theme);
    } catch {
      // theme just won't persist across reloads
    }
  }, [theme]);

  function loadInfo() {
    setLoadError(false);
    fetchInfo()
      .then((data) => {
        setProblems(data.problems || []);
        setReferenceViews(data.reference_views || []);
        setEngine(data.engine || null);
      })
      .catch(() => setLoadError(true));
  }

  useEffect(() => {
    loadInfo();
    // The phone's back button returns from a problem to the list.
    const onPop = () => setSelected(problemFromUrl());
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openProblem(name) {
    window.history.pushState({}, "", `?problem=${encodeURIComponent(name)}`);
    setSelected(name);
    window.scrollTo({ top: 0 });
  }

  function closeProblem() {
    stopCamera();
    if (problemFromUrl()) window.history.back();
    else setSelected(null);
  }

  // Leaving a problem (including via the back button) turns the camera off.
  useEffect(() => {
    if (!selected) stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // ── Camera + live tracking ────────────────────────────────────────────────
  // Hand landmarks come from MediaPipe in the browser and the point geometry
  // runs locally too (geometry.js), on the same frame that's on screen.

  function detectionLoop() {
    if (!runningRef.current) return;
    const video = videoRef.current;
    if (video && video.readyState >= 2 && trackerRef.current && engineRef.current &&
        video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime;
      const target = problemRef.current;
      const state = buildState(
        trackerRef.current.detect(video, performance.now()),
        engineRef.current,
        target ? [target] : []
      );
      const status = state.problems[0];
      const wanted = new Set(status?.required_points || []);
      renderOverlay(state.active_points.filter((p) => wanted.has(p.label)));

      // Only re-render React when what the user sees in the panel changes.
      const next = { hands: state.hands, found: status?.found_points || [], complete: !!status?.complete };
      const key = JSON.stringify(next);
      if (key !== lastUiRef.current) {
        lastUiRef.current = key;
        setLive(next);
      }
    }
    rafRef.current = requestAnimationFrame(detectionLoop);
  }

  function renderOverlay(points) {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || !video.videoWidth) return;
    if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
    if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
    drawOverlay(canvas.getContext("2d"), canvas.width, canvas.height, points);
  }

  async function startCamera() {
    setCameraError("");
    setStarting(true);
    try {
      if (!engineRef.current) throw new Error("the app is still loading — try again in a moment");
      // Front camera only: the mirrored preview and the left/right hand
      // correction both assume it, and some phones default to the back one.
      // "ideal" sizes let phones pick their nearest native mode.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      trackerRef.current = await createHandTracker();

      runningRef.current = true;
      lastVideoTimeRef.current = -1;
      lastUiRef.current = "";
      setRunning(true);
      rafRef.current = requestAnimationFrame(detectionLoop);
    } catch (err) {
      setCameraError(
        err?.name === "NotAllowedError"
          ? "Camera access was blocked. Allow the camera for this site in your browser settings, then try again."
          : "Couldn't start the camera: " + (err?.message || err)
      );
      stopCamera();
    } finally {
      setStarting(false);
    }
  }

  function stopCamera() {
    runningRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setRunning(false);
    setLive({ hands: [], found: [], complete: false });
  }

  function savePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const out = document.createElement("canvas");
    out.width = video.videoWidth;
    out.height = video.videoHeight;
    const ctx = out.getContext("2d");
    // the preview is mirrored with CSS; the overlay already draws mirrored
    ctx.save();
    ctx.translate(out.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, out.width, out.height);
    ctx.restore();
    ctx.drawImage(canvasRef.current, 0, 0, out.width, out.height);
    const a = document.createElement("a");
    a.href = out.toDataURL("image/jpeg", 0.9);
    a.download = `su-jok-${Date.now()}.jpg`;
    a.click();
  }

  const camera = {
    videoRef,
    canvasRef,
    running,
    starting,
    error: cameraError,
    live,
    videoAspect,
    onVideoSize: (w, h) => setVideoAspect([w, h]),
    start: startCamera,
    stop: stopCamera,
    savePhoto,
  };

  return (
    <div className="app">
      <header className="topbar">
        <button type="button" className="brand" onClick={closeProblem} aria-label="Home">
          <img className="brand-mark" src="/img/logo-200.webp" width="44" height="44" alt="" />
          <span className="brand-sep" aria-hidden="true" />
          <span className="brand-name">Revive Su Jok</span>
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title={theme === "dark" ? "Light mode" : "Dark mode"}
        >
          {theme === "dark" ? (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="12" cy="12" r="4.5" />
              <path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M20.5 14.7A8.5 8.5 0 0 1 9.3 3.5a.75.75 0 0 0-.9-1 10 10 0 1 0 13.1 13.1.75.75 0 0 0-1-.9z" />
            </svg>
          )}
        </button>
      </header>

      <main className="main">
        {loadError ? (
          <div className="notice notice-error">
            <p>Couldn&rsquo;t load the app. Check your internet connection.</p>
            <button type="button" className="btn btn-primary" onClick={loadInfo}>Try again</button>
          </div>
        ) : problem ? (
          <ProblemDetail
            problem={problem}
            views={referenceViews}
            engine={engine}
            camera={camera}
            onBack={closeProblem}
          />
        ) : (
          <ProblemList problems={visibleProblems} loading={!problems.length} onOpen={openProblem} />
        )}
      </main>

      <nav className="tabbar" aria-label="Main">
        <button type="button" className={`tab${!problem ? " on" : ""}`} onClick={() => { if (problem) closeProblem(); else window.scrollTo({ top: 0, behavior: "smooth" }); }}>
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3 3 10.5V21h6v-6h6v6h6V10.5z" /></svg>
          Home
        </button>
        <button type="button" className="tab" onClick={() => {
          const go = () => document.getElementById("areas")?.scrollIntoView({ behavior: "smooth" });
          if (problem) { closeProblem(); setTimeout(go, 150); } else go();
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" strokeLinejoin="round" /></svg>
          Explore
        </button>
      </nav>

      <footer className="footer">
        For general wellness only &mdash; not a substitute for professional medical advice.
        See a doctor for severe, sudden or lasting pain.
      </footer>
    </div>
  );
}
