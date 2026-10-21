import { useEffect, useRef } from "react";
import site from "../site";
import { IconShield, IconClose, IconCamera, IconHand, IconCheck, IconLock } from "./Icons";

// Step 2: a soft, see-through reassurance card shown before the browser asks for the camera.
export default function PrivacyPopup({ t, onOpen, onSkip, onClose, onDetails }) {
  const openRef = useRef(null);
  useEffect(() => {
    openRef.current?.focus({ preventScroll: true });
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="pp-back" onClick={onClose}>
      <div className="pp-card" role="dialog" aria-labelledby="pp-title" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="pp-x" onClick={onClose} aria-label={t.close}><IconClose size={20} /></button>
        <span className="pp-ico" aria-hidden="true"><IconShield size={30} /></span>
        <h2 id="pp-title">{t.ppTitle}</h2>
        <p className="pp-from">{t.ppFrom} · {site.address.split(",")[1]?.trim() || "Ghaziabad"}</p>
        <ul className="pp-list">
          <li><IconLock size={20} /><span>{t.ppOnPhone}</span></li>
          <li><IconCheck size={20} /><span>{t.ppNotSaved}</span></li>
          <li><IconHand size={20} /><span>{t.ppHandOnly}</span></li>
          <li><IconCamera size={20} /><span>{t.ppStopAny}</span></li>
        </ul>
        <button ref={openRef} type="button" className="btn btn-primary btn-lg" onClick={onOpen}><IconCamera size={22} />{t.ppOpen}</button>
        <button type="button" className="btn btn-ghost" onClick={onSkip}>{t.ppSkip}</button>
        <button type="button" className="pp-link" onClick={onDetails}>{t.ppDetails}</button>
      </div>
    </div>
  );
}
