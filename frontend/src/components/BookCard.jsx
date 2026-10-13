import site from "../site";

const waUrl = `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(site.whatsappText)}`;

// Invitation to continue with the centre itself. `compact` is the shorter
// version shown under a problem's steps.
export default function BookCard({ compact = false }) {
  return (
    <section className={`book-card${compact ? " compact" : ""}`} aria-labelledby={compact ? "book-c" : "book-h"}>
      <div>
        <span className="eyebrow">Revive &ndash; A Beauty &amp; Health Centre</span>
        <h2 id={compact ? "book-c" : "book-h"}>
          {compact ? "Want personal guidance?" : "Prefer a one-to-one visit?"}
        </h2>
        <p>
          {compact
            ? "Pain that is severe, sudden or lasting needs a professional. Book an individualised assessment at our Ghaziabad centre."
            : "Book an individualised assessment at our centre in Vasundhara, Ghaziabad. Complementary care that sits alongside your doctor's advice."}
        </p>
      </div>
      <div className="book-actions">
        <a className="btn btn-primary" href={site.bookUrl} target="_blank" rel="noopener">Book an appointment</a>
        <a className="btn btn-ghost" href={waUrl} target="_blank" rel="noopener">WhatsApp us</a>
        {!compact && <a className="btn btn-ghost" href={`tel:${site.phoneTel}`}>Call {site.phoneDisplay}</a>}
      </div>
    </section>
  );
}
