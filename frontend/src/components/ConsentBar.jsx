import site from "../site";
import { IconLock } from "./Icons";

// Shown once, until the user chooses. Statistics start only after "Allow".
export default function ConsentBar({ t, onChoose }) {
  return (
    <div className="consent-bar" role="dialog" aria-label={t.statsAsk}>
      <IconLock size={22} />
      <p>{t.statsAsk} <a href={site.privacyUrl} target="_blank" rel="noopener">{t.details}</a></p>
      <div className="consent-btns">
        <button type="button" className="btn btn-primary" onClick={() => onChoose("yes")}>{t.allow}</button>
        <button type="button" className="btn btn-ghost" onClick={() => onChoose("no")}>{t.noThanks}</button>
      </div>
    </div>
  );
}
