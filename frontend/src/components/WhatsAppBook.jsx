import site from "../site";
import { problemTitle } from "../i18n";

const Glyph = (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 20l1.3-4.2A8 8 0 1 1 8.4 18.8L4 20Z" />
    <path d="M9 9c0 3 3 6 6 6l1-1.5-2-1-1 .7a4 4 0 0 1-2-2l.7-1-1-2L9 9Z" />
  </svg>
);

// Only a greeting and the concern's name go into the message, never any
// health details.
function whatsappUrl(t, problem, lang) {
  const concern = problem ? ` ${t.waConcern}: ${problemTitle(problem, lang)}.` : "";
  const text = `${t.waMessage}${concern}`;
  return `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(text)}`;
}

// Floating button, always reachable.
export function WhatsAppFloat({ t, problem, lang }) {
  return (
    <a className="wa-float" href={whatsappUrl(t, problem, lang)} target="_blank" rel="noopener"
      aria-label={t.waBook}>
      {Glyph}
    </a>
  );
}

// Card at the end of the page.
export function BookAppointment({ t, problem, lang }) {
  return (
    <section className="flow-section book-end" aria-labelledby="book-title">
      <h2 id="book-title" className="flow-title">{t.bookTitle}</h2>
      <p className="flow-sub">{t.bookSub}</p>
      <div className="book-buttons">
        <a className="btn btn-wa btn-lg" href={whatsappUrl(t, problem, lang)} target="_blank" rel="noopener">
          {Glyph}{t.waBook}
        </a>
        <a className="btn btn-ghost btn-lg" href={`tel:${site.phoneTel}`}>
          {t.call} {site.phoneDisplay}
        </a>
        <a className="btn btn-ghost" href={site.bookUrl} target="_blank" rel="noopener">{t.bookOnline}</a>
      </div>
    </section>
  );
}
