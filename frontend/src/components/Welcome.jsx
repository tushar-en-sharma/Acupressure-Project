import { useEffect, useRef, useState } from "react";
import { STEPS } from "./steps.jsx";

const SLIDES = [
  {
    title: "Welcome to Revive Su Jok",
    text: "In Su Jok, your hand is a small map of your body. This app shows you gentle pressure-point guides for everyday wellbeing.",
  },
  {
    title: "Pick, look, find",
    text: "Choose what you'd like to ease, see the marked spot on a hand diagram, then use your camera to find that spot on your own hand.",
    steps: STEPS.slice(0, 3),
  },
  {
    title: "Then press gently",
    text: "Use a thumbnail or pen cap in small circles for 1–2 minutes. Your camera stays on your device; nothing is uploaded. This is general wellness guidance, not medical advice.",
  },
];

export default function Welcome({ onClose }) {
  const [i, setI] = useState(0);
  const btn = useRef(null);
  const last = i === SLIDES.length - 1;
  const slide = SLIDES[i];

  useEffect(() => {
    btn.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="welcome-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-h">
        <img src="/img/logo-200.webp" width="64" height="64" alt="" className="welcome-logo" />
        <h2 id="welcome-h" key={i}>{slide.title}</h2>
        <p key={`p${i}`}>{slide.text}</p>
        {slide.steps && (
          <ol className="welcome-steps">
            {slide.steps.map((s, n) => <li key={s.title}><span>{n + 1}</span>{s.title}</li>)}
          </ol>
        )}
        <div className="welcome-dots" aria-hidden="true">
          {SLIDES.map((_, n) => <span key={n} className={n === i ? "on" : ""} />)}
        </div>
        <div className="welcome-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Skip</button>
          <button ref={btn} type="button" className="btn btn-primary"
            onClick={() => (last ? onClose() : setI(i + 1))}>
            {last ? "Get started" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
