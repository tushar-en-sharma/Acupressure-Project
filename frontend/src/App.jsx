import { useEffect, useRef, useState } from "react";
import { fetchInfo } from "./api";
import { buildState } from "./geometry";
import { createHandTracker } from "./handTracking";
import { drawOverlay } from "./overlay";
import ProblemCards from "./components/ProblemCards";
import { WhatsAppFloat, BookAppointment } from "./components/WhatsAppBook";
import { STRINGS, problemTitle } from "./i18n";
import BodyPicker from "./components/BodyPicker";
import SeeStage from "./components/SeeStage";
import CameraStage, { CAMERA_DENIED } from "./components/CameraStage";
import PrivacyInfo from "./components/PrivacyInfo";
import { IconBody, IconHand, IconCamera, IconList, IconNext, IconCheck, IconHome, IconChart } from "./components/Icons";
import SiteFooter from "./components/SiteFooter";
import site from "./site";
import { track, problemKey, areaOf, deviceType, getConsent, setConsent, initAnalytics } from "./analytics";
import Progress from "./components/Progress";
import CheckIn from "./components/CheckIn";
import { loadEntries, addEntry, removeEntry, clearEntries, streakDays } from "./progress";
import ConsentBar from "./components/ConsentBar";

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
  // Tapped on the body but not yet confirmed with the arrow button.
  const [pending, setPending] = useState(problemFromUrl);
  const [camStage, setCamStage] = useState(false);
  const [listMode, setListMode] = useState(true);
  const [webglFailed, setWebglFailed] = useState(false);
  const [consent, setConsentState] = useState(getConsent);

  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [live, setLive] = useState({ hands: [], found: [], complete: false });
  const [videoAspect, setVideoAspect] = useState(null);
  // How many cameras the device has. null = not checked yet (assume phone-like until we know).
  const [entries, setEntries] = useState(loadEntries);
  const [showProgress, setShowProgress] = useState(false);
  const [checkInFor, setCheckInFor] = useState(null);
  const [cameraCount, setCameraCount] = useState(null);
  const [lastName] = useState(() => { try { return localStorage.getItem("last-problem"); } catch { return null; } });
  // Which camera the user asked for, and whether the live feed is shown as a
  // mirrored "selfie" (front camera) or as-is (back camera).
  const [facing, setFacing] = useState("environment");
  const [mirrored, setMirrored] = useState(false);
  const [photoSaved, setPhotoSaved] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const openPrivacy = () => { track("privacy_opened"); setShowPrivacy(true); };

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
  const camT0Ref = useRef(0);
  const handSeenRef = useRef(false);
  const foundRef = useRef(false);

  const stage = camStage && selected ? "camera" : selected ? "see" : "pick";
  useEffect(() => { track("stage_view", { stage, problem: problemKey(selected) }); }, [stage, selected]);

  const visibleProblems = problems.filter((p) => VISIBLE_SYSTEMS.has(p.system));
  const problem = visibleProblems.find((p) => p.name === selected) || null;
  problemRef.current = problem;
  const lastProblem = lastName ? visibleProblems.find((p) => p.name === lastName) || null : null;
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

  function chooseConsent(value) {
    setConsent(value);
    setConsentState(value);
    if (value === "yes") {
      track("app_open", { lang, large_text: large ? 1 : 0, input: deviceType(), deep_link: problemFromUrl() ? 1 : 0 });
      track("stage_view", { stage, problem: problemKey(selected) });
    }
  }

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
    initAnalytics();
    track("app_open", { lang, large_text: large ? 1 : 0, input: deviceType(), deep_link: problemFromUrl() ? 1 : 0 });
    loadInfo();
    // The phone's back button returns from a problem to the list.
    const onPop = () => { setSelected(problemFromUrl()); setPending(problemFromUrl()); setCamStage(false); };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The dropdown. An empty value clears the choice (and turns the camera off).
  function chooseProblem(name) {
    if (name) track("problem_selected", { problem: problemKey(name), area: areaOf(name), method: listMode ? "list" : "body" });
    const url = name ? `?problem=${encodeURIComponent(name)}` : window.location.pathname;
    window.history.pushState({}, "", url);
    if (name) { try { localStorage.setItem("last-problem", name); } catch { /* ignore */ } }
    setSelected(name || null);
    setCamStage(false);
    setShowProgress(false);
    window.scrollTo(0, 0);
  }

  // Leaving a problem (including via the back button) turns the camera off.
  useEffect(() => {
    if (!selected) { stopCamera(); setCamStage(false); }
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
      const secs = Math.round((performance.now() - camT0Ref.current) / 1000);
      if (!handSeenRef.current && state.hands.length) {
        handSeenRef.current = true;
        track("hand_seen", { problem: problemKey(target?.name), seconds: secs });
      }
      if (!foundRef.current && status?.complete) {
        foundRef.current = true;
        track("point_found", { problem: problemKey(target?.name), area: areaOf(target?.name), seconds: secs });
      }
      // Draw every point of every option for this problem (e.g. both
      // shoulders, palm and back-of-head), on every hand where it shows.
      const wanted = new Set((target?.protocols || []).flatMap((pr) => pr.points));
      renderOverlay(state.all_points.filter((p) => wanted.has(p.label)));

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
      const size = { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } };
      // Device check: phones/tablets (touch) have a back and a front camera, so ask for the one
      // wanted — the back camera by default. Laptops and PCs usually have one webcam, so don't
      // ask for a side at all.
      const phoneLike = deviceType() === "touch";
      let stream;
      if (phoneLike) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: want }, ...size } });
        } catch (e) {
          if (e?.name === "NotAllowedError" || e?.name === "SecurityError") throw e;
          // this phone has no such camera: take whatever it has
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: want }, ...size } });
        }
      } else {
        stream = await navigator.mediaDevices.getUserMedia({ video: size });
      }
      streamRef.current = stream;
      // Labels/devices are only listed once the camera is allowed, so count them now.
      navigator.mediaDevices.enumerateDevices?.().then((list) => {
        const n = list.filter((x) => x.kind === "videoinput").length;
        setCameraCount(n || 1);
      }).catch(() => {});
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
      camT0Ref.current = performance.now();
      handSeenRef.current = false;
      foundRef.current = false;
      track("camera_started", { facing: want, problem: problemKey(problemRef.current?.name) });
      rafRef.current = requestAnimationFrame(detectionLoop);
      if (phoneLike && want === "environment" && !isBack) {
        setCameraError("No back camera found on this device, so the front camera is being used.");
      }
    } catch (err) {
      track(err?.name === "NotAllowedError" ? "camera_denied" : "camera_error", { reason: err?.name || "unknown" });
      setCameraError(
        err?.name === "NotAllowedError"
          ? CAMERA_DENIED
          : "Couldn't start the camera: " + (err?.message || err)
      );
      stopCamera();
    } finally {
      setStarting(false);
    }
  }

  // Phones dim and lock the screen while you hold a hand up; keep it awake during the camera
  const wakeRef = useRef(null);
  useEffect(() => {
    if (!running || !navigator.wakeLock) return undefined;
    navigator.wakeLock.request("screen").then((l) => { wakeRef.current = l; }).catch(() => {});
    return () => { wakeRef.current?.release?.().catch?.(() => {}); wakeRef.current = null; };
  }, [running]);

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
    track("camera_flip", { to: want });
    stopCamera();
    await startCamera(want);
  }

  function savePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    track("photo_saved", { problem: problemKey(problemRef.current?.name), found: foundRef.current ? 1 : 0 });
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
    setPhotoSaved(true);
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
    // Switch button: phones/tablets with more than one camera only (PCs have no front/back).
    canFlip: deviceType() === "touch" && cameraCount !== 1,
    chooseCamera,
    start: () => startCamera(facing),
    // One tap from the diagram: bring the camera into view and switch it on.
    tryNow: () => {
      track("camera_tap", { problem: problemKey(problemRef.current?.name) });
      setCamStage(true);
      if (!running && !starting) startCamera(facing);
    },
    stop: stopCamera,
    openCheckIn: () => { if (problemRef.current) setCheckInFor(problemRef.current.name); },
    goHome: () => { stopCamera(); chooseProblem(""); },
    savePhoto,
  };

  return (
    <div className={`app${large ? " large" : ""}`}>
      <header className="topbar">
        <div className="topbar-row">
          <button type="button" className="brand" onClick={() => chooseProblem("")} aria-label={t.home} title={t.home}>
            <img className="brand-mark" src="/img/logo-200.webp" width="44" height="44" alt="" />
            <span className="brand-name">Revive Acupressure App</span>
          </button>
          <div className="top-actions">
            <div className="lang-switch" role="group" aria-label="Language">
              <button type="button" className={lang === "hi" ? "on" : ""} aria-pressed={lang === "hi"} onClick={() => { setLang("hi"); track("language_changed", { to: "hi" }); }}>हिंदी</button>
              <button type="button" className={lang === "en" ? "on" : ""} aria-pressed={lang === "en"} onClick={() => { setLang("en"); track("language_changed", { to: "en" }); }}>EN</button>
            </div>
            <button type="button" className={`size-btn${large ? " on" : ""}`} aria-pressed={large}
              onClick={() => { track("large_text_toggled", { on: large ? 0 : 1 }); setLarge((v) => !v); }} title={large ? t.normal : t.bigger} aria-label={large ? t.normal : t.bigger}>
              A<span>A</span>
            </button>
            <button type="button" className="btn btn-ghost btn-sm top-progress" onClick={() => { track("progress_opened", { checkins: entries.length }); setShowProgress(true); window.scrollTo(0, 0); }}><IconChart size={18} /><span>{t.myProgress}</span></button>
            <a className="btn btn-primary btn-sm top-book" href={site.bookUrl} target="_blank" rel="noopener" onClick={() => track("book_click", { channel: "top_button" })}>{t.book}</a>
          </div>
        </div>
        <ol className="steps3" aria-label={`${t.stepChoose} / ${t.stepSee} / ${t.stepTry}`}>
          {[
            [IconBody, t.stepChoose, () => chooseProblem("")],
            [IconHand, t.stepSee, () => problem && chooseProblem(problem.name)],
            [IconCamera, t.stepTry, () => problem && camera.tryNow()],
          ].map(([Ico, label, go], i) => {
            const cur = camStage ? 3 : problem ? 2 : 1;
            return (
              <li key={i} className={i + 1 === cur ? "now" : i + 1 < cur ? "done" : ""}>
                <button type="button" onClick={go} aria-label={label} aria-current={i + 1 === cur ? "step" : undefined} disabled={i > 0 && !problem}>
                  <Ico size={22} /><span className="step-label">{label}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </header>

      <main className="main">
        {loadError ? (
          <div className="notice notice-error">
            <p>{t.loadError}</p>
            <button type="button" className="btn btn-primary" onClick={loadInfo}>{t.retry}</button>
          </div>
        ) : (
          <div className="flow">
            <h1 className="sr-only">{t.heroTitle}</h1>
            {showProgress && (
              <Progress entries={entries} t={t} colorOf={(n) => problems.find((x) => x.name === n)?.color || "#B8922F"} titleOf={(n) => { const p = problems.find((x) => x.name === n); return p ? problemTitle(p, lang) : n.replace(/^Su Jok: /, ""); }}
                onBack={() => chooseProblem("")} onAdd={(n) => setCheckInFor(n)}
                onRemove={(id) => setEntries((l) => removeEntry(l, id))} onClear={() => setEntries(clearEntries())} />
            )}
            {!showProgress && !problem && entries.length > 0 && (
              <button type="button" className="progress-chip" onClick={() => setShowProgress(true)}><IconChart size={20} />{t.myProgress}: {entries.length} {t.checkins}{streakDays(entries) > 1 ? ` · ${streakDays(entries)} ${t.streak}` : ""}</button>
            )}
            {!showProgress && !problem && lastProblem && (
              <button type="button" className="continue-card" style={{ "--c": lastProblem.color }} onClick={() => { track("continue_tap", { problem: problemKey(lastProblem.name) }); chooseProblem(lastProblem.name); }}>
                <span className="see-dot" aria-hidden="true" />
                <span><small>{t.continueSub}</small><strong>{t.continueWith} {problemTitle(lastProblem, lang)}</strong></span>
                <IconNext size={26} />
              </button>
            )}
            {!showProgress && !problem && (
              <section className="pick" aria-label={t.s1Title}>
                {listMode || webglFailed ? (
                  <ProblemCards problems={visibleProblems} loading={!problems.length} value={pending || ""}
                    onChange={chooseProblem} t={t} lang={lang} />
                ) : (
                  <BodyPicker problems={visibleProblems} value={pending} onChange={setPending}
                    onUnsupported={() => setWebglFailed(true)} flipLabel={t.flipBody} />
                )}
                {!webglFailed && (
                  <button type="button" className={`round-btn list-toggle${listMode ? " in-list" : ""}`} onClick={() => { track("view_toggled", { to: listMode ? "body" : "list" }); setListMode((v) => !v); }}
                    aria-label={listMode ? t.bodyView : t.listView} title={listMode ? t.bodyView : t.listView}>
                    {listMode ? <IconBody /> : <IconList />}
                  </button>
                )}
                {!listMode && !webglFailed && (
                  <ul className="sr-only">
                    {visibleProblems.map((p) => (
                      <li key={p.name}><button type="button" onClick={() => chooseProblem(p.name)}>{problemTitle(p, lang)}</button></li>
                    ))}
                  </ul>
                )}
                {pending && !listMode && (() => {
                  const chosen = visibleProblems.find((p) => p.name === pending);
                  return chosen ? (
                    <div className="pick-bar" style={{ "--c": chosen.color }}>
                      <span className="see-dot" aria-hidden="true" />
                      <strong>{problemTitle(chosen, lang)}</strong>
                      <button type="button" className="go-btn" onClick={() => chooseProblem(pending)} aria-label={t.next}><IconNext size={28} /></button>
                    </div>
                  ) : null;
                })()}
              </section>
            )}
            {!showProgress && problem && (
              <SeeStage problem={problem} views={referenceViews} onTry={camera.tryNow} onPrivacy={openPrivacy}
                onBack={() => chooseProblem("")} t={t} lang={lang} />
            )}
            {!showProgress && !problem && <BookAppointment t={t} problem={null} lang={lang} />}
          </div>
        )}
      </main>

      {consent === null && <ConsentBar t={t} onChoose={chooseConsent} />}
      {!problem && <SiteFooter t={t} onPrivacy={openPrivacy} />}
      <CameraStage camera={camera} problem={problem} engine={engine} active={camStage && !!problem} onPrivacy={openPrivacy}
        onBack={() => { track("camera_closed", { problem: problemKey(problem?.name), found: foundRef.current ? 1 : 0, seconds: Math.round((performance.now() - camT0Ref.current) / 1000) }); stopCamera(); setCamStage(false); }} t={t} />
      {showPrivacy && <PrivacyInfo t={t} onClose={() => setShowPrivacy(false)} />}
      {checkInFor && (() => {
        const p = problems.find((x) => x.name === checkInFor);
        return (
          <CheckIn t={t} title={p ? problemTitle(p, lang) : checkInFor}
            onSave={(v) => { setEntries((l) => addEntry(l, { problem: checkInFor, ...v })); track("checkin_saved", { problem: problemKey(checkInFor) }); }}
            onClose={() => setCheckInFor(null)}
            onSeeProgress={() => { setCheckInFor(null); stopCamera(); setCamStage(false); setShowProgress(true); window.scrollTo(0, 0); }} />
        );
      })()}
      {photoSaved && (
        <div className="modal-back" role="dialog" aria-modal="true" aria-labelledby="saved-title">
          <div className="modal-card">
            <span className="modal-ico" aria-hidden="true"><IconCheck size={34} strokeWidth={3} /></span>
            <h2 id="saved-title">{t.savedTitle}</h2>
            <p>{t.savedSub}</p>
            <button type="button" className="btn btn-primary btn-lg" onClick={() => { setPhotoSaved(false); stopCamera(); chooseProblem(""); }}><IconHome size={22} />{t.goHome}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setPhotoSaved(false)}>{t.keepTrying}</button>
            <a className="modal-link" href={site.siteUrl} rel="noopener">{t.visitSite}</a>
          </div>
        </div>
      )}
      <WhatsAppFloat t={t} problem={problem} lang={lang} />
    </div>
  );
}
