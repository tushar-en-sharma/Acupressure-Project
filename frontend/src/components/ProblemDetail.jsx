import { useEffect, useRef, useState } from "react";
import HandDiagram from "./HandDiagram";
import { downloadDiagram } from "../downloadDiagram";
import { pointName } from "../pointName";
import { fill, problemTitle } from "../i18n";


const stepNo = (n) => <span className="step-no" aria-hidden="true">{n}</span>;

function requiredFaces(problem, engine) {
  const faces = new Set();
  (problem?.protocols || []).forEach((pr) =>
    pr.points.forEach((label) => {
      const f = engine?.acu_points?.[label]?.face;
      if (f) faces.add(f);
    })
  );
  return faces;
}

function liveMessage(camera, faces, t, hasProblem) {
  const { live } = camera;
  const faceName = (f) => (f === "palm" ? t.palm : t.backOfHand);
  if (!hasProblem) return { tone: "info", text: t.pickFirst };
  if (live.complete) return { tone: "good", text: t.found };
  if (!live.hands.length) return { tone: "info", text: t.noHand };
  if (faces.size === 1) {
    const face = [...faces][0];
    if (live.hands.every((h) => h.facing !== face)) {
      return { tone: "info", text: fill(t.turn, { face: faceName(face) }) };
    }
  }
  return { tone: "info", text: t.almost };
}

function CameraPanel({ camera, faces, color, t, hasProblem }) {
  const { running, starting, error, videoAspect, videoRef, canvasRef } = camera;
  const msg = running ? liveMessage(camera, faces, t, hasProblem) : null;
  const faceWord = faces.size === 1 ? ([...faces][0] === "palm" ? t.palm : t.backOfHand) : t.hand;
  const frameStyle = running && videoAspect
    ? { aspectRatio: `${videoAspect[0]} / ${videoAspect[1]}`, maxWidth: `calc(var(--cam-max-h) * ${videoAspect[0] / videoAspect[1]})` }
    : undefined;

  return (
    <section className="flow-section camera-panel" id="step-try" aria-labelledby="cam-title">
      <h2 id="cam-title" className="flow-title">{stepNo(3)}{t.s3Title}</h2>
      <p className="flow-sub">{t.s3Sub}</p>

      <div className="cam-switch" role="group" aria-label="Choose camera">
        {[["user", t.front], ["environment", t.back]].map(([v, l]) => (
          <button key={v} type="button" className={camera.facing === v ? "on" : ""}
            aria-pressed={camera.facing === v} disabled={starting} onClick={() => camera.chooseCamera(v)}>
            {l}
          </button>
        ))}
      </div>

      <div className={`cam-frame${running ? " on" : ""}${camera.mirrored ? " mirror" : ""}`} style={frameStyle}>
        <video
          ref={videoRef}
          muted
          playsInline
          onLoadedMetadata={(e) => camera.onVideoSize(e.target.videoWidth, e.target.videoHeight)}
          onResize={(e) => camera.onVideoSize(e.target.videoWidth, e.target.videoHeight)}
        />
        <canvas ref={canvasRef} />
        {!running && (
          <div className="cam-off">
            <svg className="cam-icon" viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M3 7h3l1.5-2h9L18 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" strokeLinejoin="round" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
            <p>{fill(t.holdHand, { face: faceWord })}</p>
            <button type="button" className="btn btn-primary btn-lg" onClick={camera.start} disabled={starting}
              style={{ "--c": color }}>
              {starting ? t.starting : t.start}
            </button>
            <p className="fine">{t.private}</p>
          </div>
        )}
      </div>

      {msg && (
        <p className={`live-msg ${msg.tone}`} role="status" aria-live="polite">
          {msg.tone === "good" && <span aria-hidden="true">✓ </span>}
          {msg.text}
        </p>
      )}
      {error && <p className="notice notice-error small" role="alert">{error}</p>}

      {running && (
        <div className="cam-actions">
          <button type="button" className="btn btn-secondary" onClick={camera.stop}>{t.stop}</button>
          <button type="button" className="btn btn-ghost" onClick={camera.savePhoto}>{t.savePhoto}</button>
        </div>
      )}
    </section>
  );
}

export default function ProblemDetail({ problem, views, engine, camera, t, lang }) {
  const diagramRef = useRef(null);
  const [showBar, setShowBar] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const faces = requiredFaces(problem, engine);
  const protocols = problem?.protocols || [];
  const options = protocols.map((pr) => pr.points.map(pointName).join(" + "));
  const sided = protocols.some((pr) => pr.points.some((l) => /^SJ (Right|Left) /.test(l)));
  const title = problem ? problemTitle(problem, lang) : "";
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

  const instructions = [sided ? t.how1Same : t.how1Any, t.how2, t.how3];

  // Stop reading if the problem or language changes, or the page closes.
  useEffect(() => () => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, [problem?.name, lang]);

  // Floating "Try it on your hand" bar: shown while the picture is on screen
  // and the camera section is not, so the next step is always one tap away.
  useEffect(() => {
    if (!problem || camera.running || typeof IntersectionObserver === "undefined") {
      setShowBar(false);
      return;
    }
    const seen = { see: false, cam: false };
    const update = () => setShowBar(seen.see && !seen.cam);
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { seen[e.target.id === "step-see" ? "see" : "cam"] = e.isIntersecting; });
      update();
    });
    ["step-see", "step-try"].forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [problem?.name, camera.running]);

  useEffect(() => {
    document.documentElement.classList.toggle("has-cta-bar", showBar);
    return () => document.documentElement.classList.remove("has-cta-bar");
  }, [showBar]);

  const handIcon = (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7h3l1.5-2h9L18 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );

  function toggleSpeech() {
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance([title, t.s2Sub, ...instructions].join(". "));
    u.lang = lang === "hi" ? "hi-IN" : "en-IN";
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    synth.cancel();
    synth.speak(u);
    setSpeaking(true);
  }

  return (
    <div className="flow-steps" style={{ "--c": problem?.color }}>
      <section className="flow-section" id="step-see" aria-labelledby="where-title">
        <div className="panel-head">
          <h2 id="where-title" className="flow-title">{stepNo(2)}{t.s2Title}</h2>
        </div>
        <p className="flow-sub">{problem ? <><strong>{title}</strong> &middot; {t.s2Sub}</> : t.s2Sub}</p>
        {!problem ? (
          <div className="diagram-empty">{t.placeholder}</div>
        ) : views?.length > 0 ? (
          <HandDiagram ref={diagramRef} views={views} problem={problem} />
        ) : (
          <div className="skeleton tall" />
        )}
        {problem && (
          <p className="points-line">
            <strong>{options.length > 1 ? t.pointsEither : t.point}</strong> {options.join("  or  ")}
          </p>
        )}
        {problem && views?.length > 0 && (
          <button type="button" className="btn btn-primary btn-lg try-cta" onClick={camera.tryNow} style={{ "--c": problem.color }}>
            {handIcon}{t.tryCta}<span className="try-arrow" aria-hidden="true">↓</span>
          </button>
        )}
        <div className="row-actions">
          {canSpeak && (
            <button type="button" className="btn btn-ghost" onClick={toggleSpeech} aria-pressed={speaking}>
              <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 8v4h3l4 3V5L6 8zM13.5 7.5a3.5 3.5 0 0 1 0 5M15.5 5.5a6 6 0 0 1 0 9" />
              </svg>
              {speaking ? t.listening : t.listen}
            </button>
          )}
          {problem && views?.length > 0 && (
            <button type="button" className="btn btn-ghost"
              onClick={() => downloadDiagram(diagramRef.current, `Revive Acupressure - ${(problem.title || problem.name).replace(/[\\/]+/g, "-")}.png`)}>
              {t.saveImage}
            </button>
          )}
        </div>
      </section>

      {showBar && (
        <div className="cta-bar">
          <button type="button" className="btn btn-primary btn-lg" onClick={camera.tryNow}>
            {handIcon}{t.tryCta}
          </button>
        </div>
      )}

      <CameraPanel camera={camera} faces={faces} color={problem?.color} t={t} hasProblem={!!problem} />

      <section className="flow-section steps-panel" aria-labelledby="how-title">
        <h2 id="how-title" className="flow-title">{stepNo(4)}{t.s4Title}</h2>
        <ol className="steps">
          {instructions.map((x) => <li key={x}>{x}</li>)}
        </ol>
      </section>
    </div>
  );
}
