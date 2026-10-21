import { useEffect } from "react";
import site from "../site";
import { IconClose, IconShield } from "./Icons";

// Plain-language "how your camera is used" page. Every statement here matches the code:
// frames and hand points are processed in the browser (handTracking.js, geometry.js), the hand
// model is served from this site, and the only network traffic is anonymous events after consent.
export default function PrivacyInfo({ t, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal-card pi-card" role="dialog" aria-modal="true" aria-labelledby="pi-title" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="pp-x" onClick={onClose} aria-label={t.close}><IconClose size={20} /></button>
        <span className="modal-ico" aria-hidden="true"><IconShield size={32} /></span>
        <h2 id="pi-title">{t.piTitle}</h2>
        <dl className="pi-list">
          {t.piItems.map(([q, a]) => (<div key={q}><dt>{q}</dt><dd>{a}</dd></div>))}
        </dl>
        <p className="pi-verify"><strong>{t.piVerifyTitle}</strong> {t.piVerify}</p>
        <a className="modal-link" href={site.privacyUrl} target="_blank" rel="noopener">{t.piFull}</a>
        <button type="button" className="btn btn-primary btn-lg" onClick={onClose}>{t.piClose}</button>
      </div>
    </div>
  );
}
