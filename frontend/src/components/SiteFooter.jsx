import site from "../site";

const YEAR = new Date().getFullYear();

const LINKS = [
  ["Main website", site.siteUrl],
  ["Our services", site.servicesUrl],
  ["Book an appointment", site.bookUrl],
  ["Contact", site.contactUrl],
];

export default function SiteFooter({ t }) {
  return (
    <footer className="footer site-footer">
      <div className="foot-grid">
        <div>
          <a className="foot-brand" href={site.siteUrl} target="_blank" rel="noopener">
            <img src="/img/logo-200.webp" width="56" height="56" alt="" />
            <span>Revive<small>A Beauty &amp; Health Centre</small></span>
          </a>
          <p>Individualised assessment and complementary wellness care.</p>
        </div>
        <nav aria-label="Revive website">
          <h3>Revive website</h3>
          <ul>
            {LINKS.map(([l, h]) => (
              <li key={l}><a href={h} target="_blank" rel="noopener">{l}</a></li>
            ))}
          </ul>
        </nav>
        <div>
          <h3>Visit us</h3>
          <ul>
            <li>{site.address}</li>
            <li>{site.hours}</li>
            <li><a href={`tel:${site.phoneTel}`}>{site.phoneDisplay}</a></li>
            <li><a href={`mailto:${site.email}`}>{site.email}</a></li>
            <li>In-person &amp; online consultations</li>
            <li><a href={site.directionsUrl} target="_blank" rel="noopener">Get directions</a></li>
          </ul>
        </div>
      </div>
      <p className="foot-note">{t.safety}</p>
      <p className="foot-note">
        <a href={site.privacyUrl} target="_blank" rel="noopener">Privacy</a> &middot;{" "}
        <a href={site.termsUrl} target="_blank" rel="noopener">Terms</a> &middot; &copy; {YEAR} Revive
      </p>
    </footer>
  );
}
