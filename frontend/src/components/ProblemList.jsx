import { useState } from "react";

const RESET_PICKS = ["Su Jok: Neck Pain", "Su Jok: Shoulder Pain"];

const S = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" };
const ICONS = {
  head: <path d="M9 6a5 5 0 0 1 9 3c0 2 1 3 2 4l-2 1v3h-3v4M11 22v-4M7 13l1.5 2" />,
  chest: <path d="M7 5c0 6-2 9-2 15M17 5c0 6 2 9 2 15M7 5c2 2 8 2 10 0M12 9v4" />,
  back: <path d="M7 5c-1 5-2 9-1 15M17 5c1 5 2 9 1 15M12 6v14M10 9h4M10 13h4M10 17h4" />,
  limbs: <path d="M15 4c-2 5-3 8-6 11-1 1-2 3-3 5M9 15l6 5M15 4l3 2" />,
  other: <circle cx="12" cy="12" r="6" />,
};

// Body-area groups, so a long list scans like a menu. Problems not listed
// here still show up, under "Other".
const GROUPS = [
  { id: "head", title: "Head & Neck", names: ["Su Jok: Headache", "Su Jok: Sore Throat", "Su Jok: Neck Pain"] },
  {
    id: "chest", title: "Chest & Stomach",
    names: [
      "Su Jok: Cough / Bronchitis", "Su Jok: Palpitations", "Su Jok: Acidity / Indigestion",
      "Su Jok: Constipation", "Su Jok: Menstrual / Bladder Discomfort",
    ],
  },
  { id: "back", title: "Back", names: ["Su Jok: Upper Back Pain", "Su Jok: Lower Back Pain"] },
  {
    id: "limbs", title: "Arms & Legs",
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
    return { id: g.id, title: g.title, items };
  });
  const rest = problems.filter((p) => !used.has(p.name));
  if (rest.length) groups.push({ id: "other", title: "Other", items: rest });
  return groups.filter((g) => g.items.length);
}

export default function ProblemList({ problems, loading, onOpen }) {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState(null);
  const q = query.trim().toLowerCase();
  const matches = q
    ? problems.filter((p) => titleOf(p).toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
    : problems;
  const groups = groupProblems(problems);
  const resetPick = RESET_PICKS.map((n) => problems.find((p) => p.name === n)).find(Boolean);

  function startReset() {
    if (resetPick) onOpen(resetPick.name);
    else document.getElementById("areas")?.scrollIntoView({ behavior: "smooth" });
  }

  const Chev = () => (
    <svg className="chev" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <path d="M7.5 4.5 13 10l-5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  const ProblemRow = ({ p }) => (
    <button type="button" className="prob" style={{ "--c": p.color }} onClick={() => onOpen(p.name)}>
      <span className="card-dot" aria-hidden="true" />
      <span className="card-text">
        <span className="card-title">{titleOf(p)}</span>
        <span className="card-desc">{p.description}</span>
      </span>
      <Chev />
    </button>
  );

  return (
    <div className="home">
      <section className="hello">
        <svg className="hello-leaf" viewBox="0 0 220 200" aria-hidden="true">
          <circle className="blob" cx="120" cy="110" r="84" fill="currentColor" opacity="0.7" />
          <g {...S} strokeWidth="1.6">
            <path d="M200 190C170 150 140 110 110 40" />
            <path d="M110 40c-18 18-22 40-8 58 16-10 20-38 8-58ZM150 90c22-6 40 6 46 26-22 6-42-4-46-26ZM140 125c-20-10-40 0-46 18 20 8 40 0 46-18ZM128 70c-20 0-36 12-38 30 20 2 36-8 38-30Z" />
          </g>
        </svg>
        <p className="hi">Hello,</p>
        <h1>What would you like to ease today?</h1>
        <p className="sub">Explore gentle pressure-point guides for everyday wellbeing.</p>
      </section>

      <section className="reset-card">
        <h2>Unwind a tense day</h2>
        <p>A few mindful minutes to relax and reset.</p>
        <button type="button" className="btn btn-primary" onClick={startReset} disabled={loading}>
          Start a reset
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
            <path d="M3 10h13M11 5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <svg className="reset-art" viewBox="0 0 230 150" aria-hidden="true">
          <g {...S} strokeWidth="1.4">
            <path d="M10 118c30-6 60-22 84-44l26-24c6-6 14 0 10 8l-10 14 36-30c6-5 13 2 8 8l-26 26 30-22c6-4 12 3 7 8l-34 30c-10 10-20 26-26 38" />
          </g>
          <g className="leaf" {...S} strokeWidth="1.4">
            <path d="M200 140c0-40 6-80 22-120M200 100c-16-4-24-18-22-32 16 4 24 16 22 32ZM204 70c14-6 20-20 16-32-14 6-20 18-16 32Z" />
          </g>
        </svg>
      </section>

      <h2 className="areas-title" id="areas">Explore by body area</h2>

      <label className="search">
        <svg className="search-icon" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
          <circle cx="9" cy="9" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <line x1="13.7" y1="13.7" x2="18" y2="18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <input
          id="problem-search"
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
          {Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton" />)}
        </div>
      ) : q ? (
        matches.length === 0 ? (
          <p className="empty">
            Nothing matches &ldquo;{query}&rdquo;. Try a body part, like &ldquo;back&rdquo; or &ldquo;knee&rdquo;.
          </p>
        ) : (
          <ul className="results">
            {matches.map((p) => <li key={p.name}><ProblemRow p={p} /></li>)}
          </ul>
        )
      ) : (
        <div className="areas">
          {groups.map((g, i) => {
            const open = openId === g.id;
            return (
              <section key={g.id} className={`area${open ? " open" : ""}`} style={{ "--i": i }}>
                <button type="button" className="area-head" aria-expanded={open} aria-controls={`area-${g.id}`}
                  onClick={() => setOpenId(open ? null : g.id)}>
                  <span className="area-ico">
                    <svg viewBox="0 0 24 24" aria-hidden="true" {...S}>{ICONS[g.id] || ICONS.other}</svg>
                  </span>
                  <span className="area-name">{g.title}</span>
                  <span className="area-count">{g.items.length}</span>
                  <Chev />
                </button>
                <div className="area-body" id={`area-${g.id}`} role="region" aria-label={g.title}>
                  <ul>
                    {g.items.map((p) => <li key={p.name}><ProblemRow p={p} /></li>)}
                  </ul>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
