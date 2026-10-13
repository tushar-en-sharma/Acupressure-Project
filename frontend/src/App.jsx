import { useEffect, useRef, useState } from "react";
import { fetchInfo } from "./api";
import { buildState } from "./geometry";
import { createHandTracker } from "./handTracking";
import { drawOverlay } from "./overlay";
import ProblemCards from "./components/ProblemCards";
import { WhatsAppFloat, BookAppointment } from "./components/WhatsAppBook";
import { STRINGS } from "./i18n";
import ProblemDetail from "./components/ProblemDetail";
import SiteFooter from "./components/SiteFooter";
import site from "./site";

// Which point systems the app offers. Classical acupressure is hidden for
// now — add "hand_acupoint" / "hand_reflex" back here to show it again.
const VISIBLE_SYSTEMS = new Set(["su_jok"]);

function getInitialLang() {
  try {
    const saved = localStorage.getItem("lang");
    if (saved === "en" || saved === "hi") return saved;
  } catch {
    // localStorage unavailable — fall through
  }
  return navigator.language?.toLowerCase().startsWith("hi") ? "hi" : "en";
}

function getInitialLarge() {
  try {
    return localStorage.getItem("large-text") === "1";
  } catch {
    return false;
  }
}

function problemFromUrl() {
  return new URLSearchParams(window.location.search).get("problem");
}

export default function App() {
  const [lang, setLang] = useState(getInitialLang);
  const [large, setLarge] = useState(getInitialLarge);
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
  // Which camera the user asked for, and whether the live feed is shown as a
  // mirrored "selfie" (front camera) or as-is (back camera).
  const [facing, setFacing] = useState("user");
  const [mirrored, setMirrored] = useState(true);

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
  const mirroredRef = useRef(true);

  const visibleProblems = problems.filter((p) => VISIBLE_SYSTEMS.has(p.system));
  const problem = visibleProblems.find((p) => p.name === selected) || null;
  problemRef.current = problem;
  engineRef.current = engine;

  const t = STRINGS[lang];

  useEffect(() => {
    document.documentElement.dataset.theme = "light";
    document.documentElement.lang = lang;
    try {
      localStorage.setItem("lang", lang);
    } catch {
      // choice just won't persist
    }
  }, [lang]);

  useEffect(() => {
    try {
      localStorage.setItem("large-text", large ? "1" : "0");
    } catch {
      // choice just won't persist
    }
  }, [large]);

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

  // The dropdown. An empty value clears the choice (and turns the camera off).
  function chooseProblem(name) {
    const url = name ? `?problem=${encodeURIComponent(name)}` : window.location.pathname;
    window.history.pushState({}, "", url);
    setSelected(name || null);
  }

  // After picking a problem, bring the "where to press" picture into view.
  useEffect(() => {
    if (!problem) return;
    const id = requestAnimationFrame(() =>
      document.getElementById("step-see")?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
    return () => cancelAnimationFrame(id);
    // only when the chosen problem changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problem?.name]);

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
    drawOverlay(canvas.getContext("2d"), canvas.width, canvas.height, points, mirroredRef.current);
  }

  async function startCamera(want = facing) {
    setCameraError("");
    setStarting(true);
    try {
      if (!engineRef.current) throw new Error("the app is still loading — try again in a moment");
      // Front ("user") or back ("environment") camera. "ideal" lets devices
      // with one camera (most laptops) still start instead of failing.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: want }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
      });
      streamRef.current = stream;
      // Trust what the browser actually gave us; if it doesn't say, it's a
      // webcam/front camera. Only the front camera is shown mirrored. The
      // hand-side detection works on the raw frame, so it's the same for both.
      const actual = stream.getVideoTracks()[0]?.getSettings?.().facingMode;
      const isBack = actual === "environment";
      mirroredRef.current = !isBack;
      setMirrored(!isBack);
      setFacing(isBack ? "environment" : "user");
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      trackerRef.current = await createHandTracker();

      runningRef.current = true;
      lastVideoTimeRef.current = -1;
      lastUiRef.current = "";
      setRunning(true);
      rafRef.current = requestAnimationFrame(detectionLoop);
      if (want === "environment" && !isBack) {
        setCameraError("No back camera found on this device, so the front camera is being used.");
      }
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

  // Picks the camera; if the camera is already on, restarts it on the new one.
  async function chooseCamera(want) {
    if (want === facing && !running) return;
    if (!running) {
      setFacing(want);
      return;
    }
    if (want === facing) return;
    stopCamera();
    await startCamera(want);
  }

  function savePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const out = document.createElement("canvas");
    out.width = video.videoWidth;
    out.height = video.videoHeight;
    const ctx = out.getContext("2d");
    // the front-camera preview is mirrored with CSS; the overlay already
    // draws in the same orientation as what's on screen
    ctx.save();
    if (mirroredRef.current) {
      ctx.translate(out.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, out.width, out.height);
    ctx.restore();
    ctx.drawImage(canvasRef.current, 0, 0, out.width, out.height);
    const a = document.createElement("a");
    a.href = out.toDataURL("image/jpeg", 0.9);
    a.download = `revive-acupressure-${Date.now()}.jpg`;
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
    facing,
    mirrored,
    chooseCamera,
    start: () => startCamera(facing),
    stop: stopCamera,
    savePhoto,
  };

  return (
    <div className={`app${large ? " large" : ""}`}>
      <header className="topbar">
        <div className="topbar-row">
          <button type="button" className="brand" onClick={() => chooseProblem("")} aria-label="Home">
            <img className="brand-mark" src="/img/logo-200.webp" width="44" height="44" alt="" />
            <span className="brand-name">Revive Acupressure App</span>
          </button>
          <div className="top-actions">
            <div className="lang-switch" role="group" aria-label="Language">
              <button type="button" className={lang === "hi" ? "on" : ""} aria-pressed={lang === "hi"} onClick={() => setLang("hi")}>हिंदी</button>
              <button type="button" className={lang === "en" ? "on" : ""} aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
            </div>
            <button type="button" className={`size-btn${large ? " on" : ""}`} aria-pressed={large}
              onClick={() => setLarge((v) => !v)} title={large ? t.normal : t.bigger} aria-label={large ? t.normal : t.bigger}>
              A<span>A</span>
            </button>
            <a className="btn btn-primary btn-sm top-book" href={site.bookUrl} target="_blank" rel="noopener">{t.book}</a>
          </div>
        </div>
      </header>

      <main className="main">
        {loadError ? (
          <div className="notice notice-error">
            <p>{t.loadError}</p>
            <button type="button" className="btn btn-primary" onClick={loadInfo}>{t.retry}</button>
          </div>
        ) : (
          <div className="flow">
            <div className="hero-copy">
              <h1>{t.heroTitle}</h1>
              <p>{t.heroSub}</p>
            </div>
            <ProblemCards
              problems={visibleProblems}
              loading={!problems.length}
              value={problem ? problem.name : ""}
              onChange={chooseProblem}
              t={t}
              lang={lang}
            />
            <ProblemDetail problem={problem} views={referenceViews} engine={engine} camera={camera} t={t} lang={lang} />
            <BookAppointment t={t} problem={problem} lang={lang} />
          </div>
        )}
      </main>

      <SiteFooter t={t} />
      <WhatsAppFloat t={t} problem={problem} lang={lang} />
    </div>
  );
}
