import site from "../site";

const waUrl = `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(site.whatsappText)}`;

const Pin = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" />
  </svg>
);
const Screen = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="5" width="18" height="12" rx="2" /><path d="M9 21h6M12 17v4" />
  </svg>
);

// How to reach the centre: in person (offline) or remotely (online).
export default function ConsultOptions() {
  return (
    <section className="consult" aria-labelledby="consult-h">
      <span className="eyebrow">Revive &ndash; A Beauty &amp; Health Centre</span>
      <h2 id="consult-h">Consult with us, online or in person</h2>
      <p className="consult-lede">
        Individualised assessment and complementary wellness care. Choose what suits you.
      </p>

      <div className="consult-grid">
        <article className="consult-card">
          <span className="area-ico">{Pin}</span>
          <h3>Visit the centre</h3>
          <p>In-person assessment and sessions at our Vasundhara centre.</p>
          <ul>
            <li>{site.address}</li>
            <li>{site.hours}</li>
          </ul>
          <div className="book-actions">
            <a className="btn btn-primary btn-sm" href={site.bookUrl} target="_blank" rel="noopener">Book a visit</a>
            <a className="btn btn-ghost btn-sm" href={site.directionsUrl} target="_blank" rel="noopener">Get directions</a>
          </div>
        </article>

        <article className="consult-card">
          <span className="area-ico">{Screen}</span>
          <h3>Consult online</h3>
          <p>Can&rsquo;t travel? Talk to us remotely. Message us and we&rsquo;ll confirm a suitable time.</p>
          <ul>
            <li>Share only your name and a convenient time on WhatsApp &mdash; keep medical details for the consultation.</li>
          </ul>
          <div className="book-actions">
            <a className="btn btn-primary btn-sm" href={waUrl} target="_blank" rel="noopener">WhatsApp us</a>
            <a className="btn btn-ghost btn-sm" href={site.bookUrl} target="_blank" rel="noopener">Request online</a>
          </div>
        </article>
      </div>

      <div className="contact-strip">
        <a href={`tel:${site.phoneTel}`}><strong>Call</strong> {site.phoneDisplay}</a>
        <a href={`mailto:${site.email}`}><strong>Email</strong> {site.email}</a>
        <a href={site.contactUrl} target="_blank" rel="noopener"><strong>More</strong> Contact page</a>
      </div>
    </section>
  );
}
