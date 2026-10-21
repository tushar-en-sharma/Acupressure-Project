import { useState } from "react";
import { IconCheck } from "./Icons";

// Two sliders: how it felt before pressing and how it feels now (0 = none, 10 = worst).
export default function CheckIn({ title, t, onSave, onClose, onSeeProgress }) {
  const [before, setBefore] = useState(5);
  const [after, setAfter] = useState(3);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  const high = before >= 8 || after >= 8;

  if (saved) {
    return (
      <div className="modal-back" role="dialog" aria-modal="true" aria-labelledby="ci-title">
        <div className="modal-card">
          <span className="modal-ico" aria-hidden="true"><IconCheck size={34} strokeWidth={3} /></span>
          <h2 id="ci-title">{t.ciSaved}</h2>
          <p>{t.ciSavedSub}</p>
          <button type="button" className="btn btn-primary btn-lg" onClick={onSeeProgress}>{t.myProgress}</button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t.ciDone}</button>
        </div>
      </div>
    );
  }
  const slider = (id, label, value, set) => (
    <div className="ci-field">
      <label htmlFor={id}>{label} <b className="ci-val">{value}</b></label>
      <input id={id} type="range" min="0" max="10" step="1" value={value} onChange={(e) => set(Number(e.target.value))} />
      <div className="ci-scale"><span>{t.ciNone}</span><span>{t.ciWorst}</span></div>
    </div>
  );
  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-labelledby="ci-title">
      <form className="modal-card ci-card" onSubmit={(e) => { e.preventDefault(); onSave({ before, after, note }); setSaved(true); }}>
        <h2 id="ci-title">{t.ciTitle}</h2>
        <p className="ci-for">{title}</p>
        {slider("ci-before", t.ciBefore, before, setBefore)}
        {slider("ci-after", t.ciAfter, after, setAfter)}
        <label className="ci-note">{t.ciNote}
          <textarea rows="2" maxLength="200" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.ciNotePh} />
        </label>
        {high && <p className="ci-warn" role="alert">{t.ciDoctor}</p>}
        <button type="submit" className="btn btn-primary btn-lg">{t.ciSave}</button>
        <button type="button" className="btn btn-ghost" onClick={onClose}>{t.ciCancel}</button>
        <small className="ci-priv">{t.ciPrivacy}</small>
      </form>
    </div>
  );
}
