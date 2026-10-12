import { useRef, useState } from "react";
import HandDiagram from "./HandDiagram";
import { downloadDiagram } from "../downloadDiagram";

// Problems are split into two sections by their "system": Su Jok
// correspondence problems get their own tab, everything else (classical
// acupoints + hand-reflex points) stays under Acupressure.
const SECTIONS = [
  { id: "acupressure", label: "Acupressure", test: (p) => p.system !== "su_jok" },
  { id: "su_jok", label: "Su Jok", test: (p) => p.system === "su_jok" },
];

const SECTION_NOTES = {
  su_jok:
    "Su Jok (Prof. Park Jae Woo): the hand is a small map of the body — thumb = head, " +
    "palm = chest and belly, index & little fingers = arms, middle & ring fingers = legs. " +
    "Press around the marked spot to find the most tender point.",
};

const titleOf = (p) => p.title || p.name;

function downloadFilename(p) {
  const section = p.system === "su_jok" ? "Su Jok - " : "";
  return `${section}${titleOf(p).replace(/[\\/]+/g, "-")} - acupressure point.png`;
}

function ProtocolProgress({ protocol }) {
  if (!protocol?.required_points) return null;

  return (
    <div className="protocol-points">
      {protocol.required_points.map((label) => (
        <span
          key={label}
          className={`point-chip${
            protocol.found_points.includes(label) ? " found" : ""
          }`}
        >
          {protocol.found_points.includes(label) ? "✓ " : ""}
          {label}
        </span>
      ))}

      <span className="progress-text">
        {protocol.found_points.length}/{protocol.required_points.length} found
      </span>
    </div>
  );
}

/** The active problem's reference card — sits inline, right on the page, so
 * it can be read side-by-side with the live camera feed instead of covering
 * it. Pinned above the list so picking a different problem never requires
 * hunting for where the answer landed. */
function SolutionCard({ problem, catalogEntry, views, live, onClose }) {
  const diagramRef = useRef(null);
  const canDraw = views?.length > 0 && catalogEntry;

  return (
    <div
      className={`solution-card${problem.complete ? " solved" : ""}`}
      style={{ "--dot-color": problem.color }}
    >
      <button className="solution-close" onClick={onClose} aria-label="Back to problem list">
        &times;
      </button>

      <div className="solution-media">
        {canDraw ? (
          <HandDiagram ref={diagramRef} views={views} problem={catalogEntry} />
        ) : (
          <div className="solution-image image-fallback" style={{ "--dot-color": problem.color }}>
            {titleOf(problem).charAt(0)}
          </div>
        )}
      </div>

      <div className="solution-body">
        <div className="solution-title-row">
          <span className="dot" />
          <div className="name">{titleOf(problem)}</div>
          {problem.complete && <span className="solved-badge">Solved</span>}
        </div>

        <div className="desc">{problem.description}</div>

        <ProtocolProgress protocol={problem} />

        {catalogEntry?.protocols?.length > 1 && (
          <div className="alt-protocols">
            Or try{catalogEntry.protocols.length > 2 ? " one of" : ""}:{" "}
            {catalogEntry.protocols
              .map((pr) => pr.points.join(" + "))
              .join("  or  ")}
          </div>
        )}

        <div className="solution-footer">
          {!problem.isLive && (
            <div className="live-hint">
              {live
                ? "Show your hand to the camera to track this live."
                : "Start the camera to track this live."}
            </div>
          )}

          {canDraw && (
            <button
              type="button"
              className="btn btn-secondary download-btn"
              onClick={() => downloadDiagram(diagramRef.current, downloadFilename(catalogEntry))}
            >
              <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 3v9.5M6.2 9l3.8 3.8L13.8 9M3.5 15.5h13" />
              </svg>
              Save Image
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProblemPanel({
  problems,
  views,
  section: sectionId,
  onSectionChange,
  liveByName,
  selected,
  onSelect,
  live,
}) {
  const [query, setQuery] = useState("");

  const section = SECTIONS.find((s) => s.id === sectionId) || SECTIONS[0];
  const sectionProblems = problems.filter(section.test);

  const currentCatalog = problems.find((p) => p.name === selected);
  const currentLive = selected ? liveByName.get(selected) : null;

  // Fall back to the catalog's first protocol so the solution card still
  // shows the point(s) to find even before the camera starts streaming
  // per-frame completion data.
  const current =
    (currentLive && { ...currentLive, isLive: true }) ||
    (currentCatalog && {
      name: currentCatalog.name,
      title: currentCatalog.title,
      description: currentCatalog.description,
      color: currentCatalog.color,
      complete: false,
      required_points: currentCatalog.protocols[0].points,
      found_points: [],
      isLive: false,
    });

  const solvedCount = sectionProblems.filter(
    (p) => liveByName.get(p.name)?.complete
  ).length;

  const q = query.trim().toLowerCase();
  const visibleProblems = q
    ? sectionProblems.filter(
        (p) =>
          titleOf(p).toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q)
      )
    : sectionProblems;

  function switchSection(id) {
    onSectionChange(id);
    // keep the open card only if it belongs to the section being shown
    const next = SECTIONS.find((s) => s.id === id);
    if (currentCatalog && !next.test(currentCatalog)) onSelect(null);
  }

  return (
    <div className="problem-panel">

      {/* Section tabs */}
      <div className="section-tabs" role="tablist" aria-label="Point system">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={s.id === sectionId}
            className={`section-tab${s.id === sectionId ? " active" : ""}`}
            onClick={() => switchSection(s.id)}
          >
            {s.label}
            <span className="section-count">{problems.filter(s.test).length}</span>
          </button>
        ))}
      </div>

      {SECTION_NOTES[sectionId] && <p className="section-note">{SECTION_NOTES[sectionId]}</p>}

      {/* Header */}
      <div className="problem-panel-head">
        <div className="problem-search">
          <svg className="search-icon" viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="9" cy="9" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <line x1="13.7" y1="13.7" x2="18" y2="18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              sectionId === "su_jok"
                ? "Search Su Jok, e.g. knee, back pain..."
                : "Search a problem, e.g. headache, insomnia..."
            }
            aria-label="Search problems"
          />
        </div>
        <span className="solved-count" aria-live="polite">
          {solvedCount}/{sectionProblems.length} solved
        </span>
      </div>

      {/* Inline reference card for whichever problem is selected — shown
          right here on the page, next to the live camera, never on top of it. */}
      {current && (
        <SolutionCard
          problem={current}
          catalogEntry={currentCatalog}
          views={views}
          live={live}
          onClose={() => onSelect(null)}
        />
      )}

      {current && <div className="list-divider">All problems</div>}

      {/* Problem list */}
      {visibleProblems.length === 0 ? (
        <p className="no-results">No problems match &ldquo;{query}&rdquo;.</p>
      ) : (
        <ul className="problem-list">
          {visibleProblems.map((p) => {
            const liveProblem = liveByName.get(p.name);
            const complete = liveProblem ? liveProblem.complete : false;
            const isSelected = selected === p.name;

            return (
              <li key={p.name}>
                <button
                  type="button"
                  className={`problem-row${complete ? " solved" : ""}${
                    isSelected ? " selected" : ""
                  }`}
                  style={{ "--dot-color": p.color }}
                  onClick={() => onSelect(isSelected ? null : p.name)}
                  aria-pressed={isSelected}
                  aria-label={`${titleOf(p)}: ${p.description}${complete ? " — solved" : ""}`}
                >
                  <span className="dot" />
                  <span className="row-text">
                    <span className="name">{titleOf(p)}</span>
                    <span className="row-desc">{p.description}</span>
                  </span>
                  {complete && (
                    <span className="row-check" aria-hidden="true">&#10003;</span>
                  )}
                  <span className="row-chevron" aria-hidden="true">&#8250;</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
