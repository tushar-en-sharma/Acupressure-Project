import { useEffect, useRef, useState } from "react";
import HandDiagram from "./HandDiagram";
import { downloadDiagram } from "../downloadDiagram";
import { pointName } from "../pointName";
import { problemTitle } from "../i18n";
import { track, problemKey } from "../analytics";
import { IconBack, IconCamera, IconSpeaker, IconStop, IconDownload, IconClock, IconRepeat } from "./Icons";

// Pointer-driven 3D tilt for the diagram card (mouse only; off for reduced motion in CSS).
function tiltMove(e) {
  if (e.pointerType !== "mouse") return;
  const el = e.currentTarget; const r = el.getBoundingClientRect();
  el.style.setProperty("--ry", `${((e.clientX - r.left) / r.width - 0.5) * 12}deg`);
  el.style.setProperty("--rx", `${-((e.clientY - r.top) / r.height - 0.5) * 12}deg`);
}
const tiltReset = (e) => { e.currentTarget.style.setProperty("--ry", "0deg"); e.currentTarget.style.setProperty("--rx", "0deg"); };

// Step 2: the hand picture with the spot marked, one big camera button, and
// three animated icons that show how to press (no reading needed).
export default function SeeStage({ problem, views, onTry, onBack, t, lang }) {
  const diagramRef = useRef(null);
  const [speaking, setSpeaking] = useState(false);
  const title = problemTitle(problem, lang);
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;
  const sided = problem.protocols.some((pr) => pr.points.some((l) => /^SJ (Right|Left) /.test(l)));
  const spoken = [title, ...[sided ? t.how1Same : t.how1Any, t.how2, t.how3]].join(". ");

  useEffect(() => () => { window.speechSynthesis?.cancel(); }, [problem.name, lang]);

  function toggleSpeech() {
    const synth = window.speechSynthesis;
    if (speaking) { synth.cancel(); setSpeaking(false); return; }
    track("listen_used", { problem: problemKey(problem.name), lang });
    const u = new SpeechSynthesisUtterance(spoken);
    u.lang = lang === "hi" ? "hi-IN" : "en-IN";
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    synth.cancel(); synth.speak(u); setSpeaking(true);
  }

  return (
    <section className="see" style={{ "--c": problem.color }} aria-label={title}>
      <div className="stage-top">
        <button type="button" className="round-btn" onClick={onBack} aria-label={t.goBack}><IconBack /></button>
        <h2 className="see-title"><span className="see-dot" aria-hidden="true" />{title}</h2>
      </div>

      <div className="tilt-card" onPointerMove={tiltMove} onPointerLeave={tiltReset}>
        {views?.length > 0
          ? <HandDiagram ref={diagramRef} views={views} problem={problem} />
          : <div className="skeleton tall" />}
      </div>

      <div className="see-actions">
        {canSpeak
          ? <button type="button" className={`round-btn lg${speaking ? " on" : ""}`} onClick={toggleSpeech} aria-pressed={speaking} aria-label={speaking ? t.listening : t.listen}>
              {speaking ? <IconStop /> : <IconSpeaker />}
            </button>
          : <span />}
        <button type="button" className="cam-go" onClick={onTry} aria-label={t.tryCta}>
          <span className="cam-go-ring" aria-hidden="true" />
          <IconCamera size={38} />
        </button>
        <button type="button" className="round-btn lg" aria-label={t.saveImage}
          onClick={() => { track("diagram_saved", { problem: problemKey(problem.name) }); downloadDiagram(diagramRef.current, `Revive Acupressure - ${(problem.title || problem.name).replace(/[\\/]+/g, "-")}.png`); }}>
          <IconDownload />
        </button>
      </div>

      <ul className="press-guide" aria-label={t.s4Title}>
        <li><span className="pg-press" aria-hidden="true"><i /><b /></span></li>
        <li><span className="pg-circle" aria-hidden="true"><IconRepeat size={34} /></span></li>
        <li><IconClock size={30} /><strong>1–2</strong></li>
        <li><IconRepeat size={26} /><strong>2–3×</strong></li>
      </ul>
      <p className="sr-only">{t.how2} {t.how3} {options(problem)}</p>
    </section>
  );
}

function options(problem) {
  return problem.protocols.map((pr) => pr.points.map(pointName).join(" + ")).join(" / ");
}
