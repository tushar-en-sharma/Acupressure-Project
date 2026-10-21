import { useEffect, useState } from "react";
import { IconBack, IconFlipCam, IconCheck, IconNoCam, IconLock, IconHand, IconHome, HandGuide } from "./Icons";

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

// Step 3: full-screen camera. The state is shown with pictures, not sentences:
// ghost hand = show your hand, flipping hand = turn it, green tick = found it.
export default function CameraStage({ camera, problem, engine, active, onBack, t }) {
  const { running, starting, error, videoAspect, videoRef, canvasRef, live } = camera;
  const faces = requiredFaces(problem, engine);
  const want = faces.size === 1 ? [...faces][0] : "palm";
  let state = "none";
  if (running) {
    if (live.complete) state = "found";
    else if (!live.hands.length) state = "none";
    else if (faces.size === 1 && live.hands.every((h) => h.facing !== want)) state = "turn";
    else state = "almost";
  }
  // If no hand shows up for a while, say how to help the camera see it
  const [tip, setTip] = useState(false);
  const waiting = running && state === "none";
  useEffect(() => {
    if (!waiting) return undefined;
    const id = setTimeout(() => setTip(true), 8000);
    return () => { clearTimeout(id); setTip(false); };
  }, [waiting]);
  const frameStyle = videoAspect ? { aspectRatio: `${videoAspect[0]} / ${videoAspect[1]}` } : undefined;

  return (
    <section className={`cam-stage${active ? " on" : ""} s-${state}`} style={{ "--c": problem?.color }} aria-hidden={!active}>
      <div className={`cam-view${camera.mirrored ? " mirror" : ""}`} style={frameStyle}>
        <video ref={videoRef} muted playsInline
          onLoadedMetadata={(e) => camera.onVideoSize(e.target.videoWidth, e.target.videoHeight)}
          onResize={(e) => camera.onVideoSize(e.target.videoWidth, e.target.videoHeight)} />
        <canvas ref={canvasRef} />
      </div>

      <div className="cam-top">
        <div className="cam-nav">
          <button type="button" className="cam-btn glass" onClick={onBack}><IconBack size={22} /><span>{t.goBack}</span></button>
          <button type="button" className="cam-btn glass" onClick={camera.goHome}><IconHome size={22} /><span>{t.home}</span></button>
        </div>
        {camera.canFlip && (
          <button type="button" className="cam-btn glass" onClick={() => camera.chooseCamera(camera.facing === "user" ? "environment" : "user")}
            disabled={starting}><IconFlipCam size={22} /><span>{camera.facing === "user" ? t.useBack : t.useFront}</span></button>
        )}
      </div>

      {running && state === "none" && (
        <div className="guide guide-none" aria-label={t.noHand} role="status">
          <HandGuide face={want} />
        </div>
      )}
      {tip && waiting && (
        <div className="cam-tip" role="status"><strong>{t.tipTitle}</strong><span>{t.tipBody}</span></div>
      )}
      {running && state === "turn" && (
        <div className="guide guide-turn" aria-label={t.turn.replace("{face}", "")} role="status">
          <div className="flip3d"><HandGuide face={want} /></div>
        </div>
      )}
      {running && state === "almost" && <div className="ring-hold" role="status" aria-label={t.almost} />}
      {running && state === "found" && (
        <div className="found-badge" role="status" aria-label={t.found}><IconCheck size={44} strokeWidth={3} /></div>
      )}
      {running && state === "found" && (
        <button type="button" className="found-cta btn btn-primary btn-lg" onClick={camera.openCheckIn}>{t.logFeeling}</button>
      )}

      {starting && !error && <div className="cam-wait" role="status"><span className="spin" aria-hidden="true" /><strong className="cam-wait-title">{t.waitTitle}</strong><span>{t.waitSub}</span><span className="cam-wait-priv"><IconLock size={16} />{t.private}</span></div>}

      {error && (
        <div className="cam-err" role="alert">
          <IconNoCam size={56} />
          <p>{error}</p>
          <button type="button" className="btn btn-primary btn-lg" onClick={camera.start}><IconHand size={22} />{t.retry}</button>
        </div>
      )}

      {running && (
        <div className="cam-bottom">
          <button type="button" className="shutter" onClick={camera.savePhoto} aria-label={t.takePhoto}><span /></button>
          <span className="shutter-label">{t.takePhoto}</span>
        </div>
      )}
    </section>
  );
}
