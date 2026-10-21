import { problemTitle } from "../i18n";

// Body areas, so the list scans like a menu. Problems not listed still show
// up, under "Other". All groups are visible at once (no collapsing).
const GROUPS = [
  { id: "head", en: "Head & Neck", hi: "सिर और गर्दन", names: ["Su Jok: Headache", "Su Jok: Sore Throat", "Su Jok: Neck Pain", "Su Jok: Cold / Blocked Nose / Sinus", "Su Jok: Dizziness", "Su Jok: Hoarse Voice / Voice Strain"] },
  {
    id: "chest", en: "Chest & Stomach", hi: "छाती और पेट",
    names: [
      "Su Jok: Cough / Bronchitis", "Su Jok: Palpitations", "Su Jok: Acidity / Indigestion",
      "Su Jok: Constipation", "Su Jok: Menstrual / Bladder Discomfort", "Su Jok: Chest Congestion", "Su Jok: Breathing Discomfort", "Su Jok: Nausea", "Su Jok: Loss of Appetite", "Su Jok: Gas / Bloating", "Su Jok: Stomach Cramps", "Su Jok: Loose Motions", "Su Jok: Period Pain", "Su Jok: Urinary Discomfort",
    ],
  },
  { id: "back", en: "Back", hi: "पीठ", names: ["Su Jok: Upper Back Pain", "Su Jok: Lower Back Pain", "Su Jok: General Backache", "Su Jok: Sciatica-type Leg Pain"] },
  {
    id: "limbs", en: "Arms & Legs", hi: "हाथ और पैर",
    names: [
      "Su Jok: Shoulder Pain", "Su Jok: Elbow Pain", "Su Jok: Wrist Pain",
      "Su Jok: Hip Pain", "Su Jok: Knee Pain", "Su Jok: Ankle Sprain",
    ],
  },
];

function groupProblems(problems) {
  const byName = new Map(problems.map((p) => [p.name, p]));
  const used = new Set();
  const groups = GROUPS.map((g) => {
    const items = g.names.map((n) => byName.get(n)).filter(Boolean);
    items.forEach((p) => used.add(p.name));
    return { ...g, items };
  });
  const rest = problems.filter((p) => !used.has(p.name));
  if (rest.length) groups.push({ id: "other", en: "Other", hi: "अन्य", items: rest });
  return groups.filter((g) => g.items.length);
}

// Step 1: every problem is on screen, grouped by body area. One tap picks it.
export default function ProblemCards({ problems, loading, value, onChange, t, lang }) {
  const groups = groupProblems(problems);
  return (
    <section className="flow-section" id="step-choose" aria-labelledby="pick-title">
      <h2 id="pick-title" className="flow-title">
        <span className="step-no" aria-hidden="true">1</span>{t.s1Title}
      </h2>
      <p className="flow-sub">{t.s1Sub}</p>

      {loading ? (
        <div className="cards-grid" aria-label="Loading">
          {Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton card-skel" />)}
        </div>
      ) : (
        <div className="groups" role="radiogroup" aria-labelledby="pick-title">
          {[groups.slice(0, 2), groups.slice(2)].map((col, ci) => (
            <div key={ci} className="group-col">
              {col.map((g, gi) => (
                <div key={g.id} className="group-box" role="group" aria-label={lang === "hi" ? g.hi : g.en}>
                  <h3 className="group-name">{lang === "hi" ? g.hi : g.en}</h3>
                  <div className="cards-grid">
                    {g.items.map((p, i) => {
                      const on = value === p.name;
                      return (
                        <button
                          key={p.name}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          className={`pcard${on ? " on" : ""}`}
                          style={{ "--i": (ci * 2 + gi) * 3 + i, "--c": p.color }}
                          onClick={() => onChange(p.name)}
                        >
                          <span className="pcard-dot" aria-hidden="true" />
                          <span className="pcard-name">{problemTitle(p, lang)}</span>
                          {on && <span className="pcard-check" aria-hidden="true">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
