import { useRef } from "react";
import HandDiagram from "./HandDiagram";
import { downloadDiagram } from "../downloadDiagram";
import { pointName } from "../pointName";

const titleOf = (p) => p.title || p.name;

function requiredFaces(problem, engine) {
  const faces = new Set();
  problem.protocols.forEach((pr) =>
    pr.points.forEach((label) => {
      const f = engine?.acu_points?.[label]?.face;
      if (f) faces.add(f);
    })
  );
  return faces;
}

function liveMessage(camera, faces) {
  const { live } = camera;
  if (live.complete) return { tone: "good", text: "Found it! Press the glowing spot on your hand." };
  if (!live.hands.length) {
    return { tone: "info", text: "Hold one hand up to the camera, fingers pointing up, about an arm’s length away." };
  }
  if (faces.size === 1) {
    const face = [...faces][0];
    if (live.hands.every((h) => h.facing !== face)) {
      return { tone: "info", text: `Turn your hand so the ${face === "palm" ? "palm" : "back of your hand"} faces the camera.` };
    }
  }
  return { tone: "info", text: "Almost there — keep your whole hand in view and hold it still." };
}

function CameraPanel({ camera, faces, color }) {
  const { running, starting, error, videoAspect, videoRef, canvasRef } = camera;
  const msg = running ? liveMessage(camera, faces) : null;
  const frameStyle = running && videoAspect
    ? { aspectRatio: `${videoAspect[0]} / ${videoAspect[1]}`, maxWidth: `calc(var(--cam-max-h) * ${videoAspect[0] / videoAspect[1]})` }
    : undefined;

  return (
    <section className="panel camera-panel" aria-labelledby="cam-title">
      <h2 id="cam-title" className="panel-title">Find it on your hand</h2>

      <div className={`cam-frame${running ? " on" : ""}`} style={frameStyle}>
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
            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M3 7h3l1.5-2h9L18 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" strokeLinejoin="round" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
            <p>Your camera shows the exact spot, live on your hand.</p>
            <button type="button" className="btn btn-primary btn-lg" onClick={camera.start} disabled={starting}
              style={{ "--c": color }}>
              {starting ? "Starting camera…" : "Start camera"}
            </button>
            <p className="fine">Works on your device only &mdash; no video is uploaded.</p>
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
          <button type="button" className="btn btn-secondary" onClick={camera.stop}>Stop camera</button>
          <button type="button" className="btn btn-ghost" onClick={camera.savePhoto}>Save photo</button>
        </div>
      )}
    </section>
  );
}

export default function ProblemDetail({ problem, views, engine, camera, onBack }) {
  const diagramRef = useRef(null);
  const faces = requiredFaces(problem, engine);
  const options = problem.protocols.map((pr) => pr.points.map(pointName).join(" + "));
  const sided = problem.protocols.some((pr) => pr.points.some((l) => /^SJ (Right|Left) /.test(l)));

  return (
    <article className="detail" style={{ "--c": problem.color }}>
      <button type="button" className="back-link" onClick={onBack}>
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
          <path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        All problems
      </button>

      <header className="detail-head">
        <span className="card-dot big" aria-hidden="true" />
        <div>
          <h1>{titleOf(problem)}</h1>
          <p>{problem.description}</p>
        </div>
      </header>

      <div className="detail-grid">
        <section className="panel diagram-panel" aria-labelledby="where-title">
          <div className="panel-head">
            <h2 id="where-title" className="panel-title">Where to press</h2>
            {views?.length > 0 && (
              <button type="button" className="btn btn-ghost btn-sm"
                onClick={() => downloadDiagram(diagramRef.current, `Su Jok - ${titleOf(problem).replace(/[\\/]+/g, "-")}.png`)}>
                <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10 3v9.5M6.2 9l3.8 3.8L13.8 9M3.5 15.5h13" />
                </svg>
                Save image
              </button>
            )}
          </div>
          {views?.length > 0 ? (
            <HandDiagram ref={diagramRef} views={views} problem={problem} />
          ) : (
            <div className="skeleton tall" />
          )}
          <p className="points-line">
            <strong>{options.length > 1 ? "Points (use either):" : "Point:"}</strong> {options.join("  or  ")}
          </p>
        </section>

        <CameraPanel camera={camera} faces={faces} color={problem.color} />

        <section className="panel steps-panel" aria-labelledby="how-title">
          <h2 id="how-title" className="panel-title">How to press</h2>
          <ol className="steps">
            <li>
              Find the marked spot{sided ? " — use the point on the same side as your pain (right or left)." : " on either hand."}
            </li>
            <li>Press gently with your thumbnail, a pen cap or a Su Jok probe, and feel around for the most tender point.</li>
            <li>Massage it in small circles for 1&ndash;2 minutes. Repeat 2&ndash;3 times a day.</li>
          </ol>
        </section>
      </div>
    </article>
  );
}
