import { useState } from "react";
import { IconCheck } from "./Icons";
import { sendFeedback } from "../feedback";

const Star = ({ on }) => (
  <svg viewBox="0 0 24 24" width="38" height="38" aria-hidden="true" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
    <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
  </svg>
);

// Stars first; the comment box appears after a star is chosen. Everything except the rating is optional.
export default function FeedbackPrompt({ t, problem, found, lang, onSent, onSkip, onClose }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [state, setState] = useState("ask");

  if (state === "thanks") {
    return (
      <div className="modal-back" role="dialog" aria-modal="true" aria-labelledby="fb-title">
        <div className="modal-card">
          <span className="modal-ico" aria-hidden="true"><IconCheck size={34} strokeWidth={3} /></span>
          <h2 id="fb-title">{t.fbThanks}</h2>
          <p>{t.fbThanksSub}</p>
          <button type="button" className="btn btn-primary btn-lg" onClick={onClose}>{t.fbDone}</button>
        </div>
      </div>
    );
  }
  const send = async () => {
    if (!rating || state === "sending") return;
    setState("sending");
    try { await sendFeedback({ rating, comment: comment.trim(), problem, found, lang }); onSent(rating, comment.trim().length > 0); setState("thanks"); }
    catch { setState("error"); }
  };
  const shown = hover || rating;
  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-labelledby="fb-title">
      <div className="modal-card fb-card">
        <h2 id="fb-title">{t.fbTitle}</h2>
        <p>{t.fbSub}</p>
        <div className="fb-stars" role="radiogroup" aria-label={t.fbTitle} onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button type="button" key={n} role="radio" aria-checked={rating === n} aria-label={t.fbStar.replace("{n}", n)}
              className={n <= shown ? "on" : ""} onMouseEnter={() => setHover(n)} onFocus={() => setHover(n)} onBlur={() => setHover(0)} onClick={() => setRating(n)}><Star on={n <= shown} /></button>
          ))}
        </div>
        <p className="fb-word" aria-live="polite">{rating ? t.fbWords[rating - 1] : "\u00a0"}</p>
        {rating > 0 && (
          <label className="fb-note">{t.fbMore}
            <textarea value={comment} maxLength={500} rows={3} placeholder={t.fbPlaceholder} onChange={(e) => setComment(e.target.value)} />
          </label>
        )}
        <p className="fb-priv">{t.fbPriv}</p>
        {state === "error" && <p className="ci-warn" role="alert">{t.fbError}</p>}
        <button type="button" className="btn btn-primary btn-lg" disabled={!rating || state === "sending"} onClick={send}>{state === "sending" ? t.fbSending : t.fbSend}</button>
        <button type="button" className="btn btn-ghost" onClick={onSkip}>{t.fbLater}</button>
      </div>
    </div>
  );
}
