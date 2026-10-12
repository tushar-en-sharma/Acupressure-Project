import { useState } from "react";

// Body-area groups, so a long list scans like a menu. Problems not listed
// here still show up, under "Other".
const GROUPS = [
  { title: "Head & neck", names: ["Su Jok: Headache", "Su Jok: Sore Throat", "Su Jok: Neck Pain"] },
  {
    title: "Chest & stomach",
    names: [
      "Su Jok: Cough / Bronchitis", "Su Jok: Palpitations", "Su Jok: Acidity / Indigestion",
      "Su Jok: Constipation", "Su Jok: Menstrual / Bladder Discomfort",
    ],
  },
  { title: "Back", names: ["Su Jok: Upper Back Pain", "Su Jok: Lower Back Pain"] },
  {
    title: "Joints",
    names: [
      "Su Jok: Shoulder Pain", "Su Jok: Elbow Pain", "Su Jok: Wrist Pain",
      "Su Jok: Hip Pain", "Su Jok: Knee Pain", "Su Jok: Ankle Sprain",
    ],
  },
];

const titleOf = (p) => p.title || p.name;

function groupProblems(problems) {
  const byName = new Map(problems.map((p) => [p.name, p]));
  const used = new Set();
  const groups = GROUPS.map((g) => {
    const items = g.names.map((n) => byName.get(n)).filter(Boolean);
    items.forEach((p) => used.add(p.name));
    return { title: g.title, items };
  });
  const rest = problems.filter((p) => !used.has(p.name));
  if (rest.length) groups.push({ title: "Other", items: rest });
  return groups.filter((g) => g.items.length);
}

export default function ProblemList({ problems, loading, onOpen }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = q
    ? problems.filter((p) => titleOf(p).toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
    : problems;
  const groups = q ? [{ title: `${matches.length} result${matches.length === 1 ? "" : "s"}`, items: matches }] : groupProblems(problems);

  return (
    <div className="home">
      <section className="hero">
        <h1>What&rsquo;s bothering you?</h1>
        <p>
          In Su Jok, your hand is a small map of your body. Pick a problem to see exactly
          where to press &mdash; then let the camera find the spot on your own hand.
        </p>
      </section>

      <label className="search">
        <svg className="search-icon" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
          <circle cx="9" cy="9" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <line x1="13.7" y1="13.7" x2="18" y2="18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search, e.g. knee, headache, back"
          aria-label="Search problems"
          enterKeyHint="search"
        />
      </label>

      {loading ? (
        <div className="skeleton-list" aria-label="Loading">
          {Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton" />)}
        </div>
      ) : matches.length === 0 ? (
        <p className="empty">
          Nothing matches &ldquo;{query}&rdquo;. Try a body part, like &ldquo;back&rdquo; or &ldquo;knee&rdquo;.
        </p>
      ) : (
        groups.map((g) => (
          <section key={g.title} className="group">
            <h2 className="group-title">{g.title}</h2>
            <ul className="cards">
              {g.items.map((p) => (
                <li key={p.name}>
                  <button type="button" className="card" style={{ "--c": p.color }} onClick={() => onOpen(p.name)}>
                    <span className="card-dot" aria-hidden="true" />
                    <span className="card-text">
                      <span className="card-title">{titleOf(p)}</span>
                      <span className="card-desc">{p.description}</span>
                    </span>
                    <svg className="chev" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
                      <path d="M7.5 4.5 13 10l-5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
