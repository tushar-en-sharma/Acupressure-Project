import { forwardRef } from "react";

// Draws a problem's solution sheet — left hand (back, palm) and right hand
// (back, palm), the same layout as the original hand-drawn reference sheets —
// from the backend's reference views (camera.py::_reference_views). Every
// point position comes from the same geometry the live tracker uses, so the
// picture always matches where the camera will mark the point.
//
// Colours are fixed (not theme variables) so the SVG still looks right when
// it's exported to a PNG outside the page (see src/downloadDiagram.js).

const PANEL_W = 300;
const PANEL_H = 300;
const TITLE_H = 46;
const ROW_LABEL_H = 26;
const LEGEND_ROW_H = 24;
const PAD = 14;

const SKIN = "#fbe7d6";
const LINE = "#5b4a42";
const INK = "#1f2933";
const MUTED = "#8a96a3";

const FINGERS = [
  [1, 2, 3, 4],
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
];
const FINGER_WIDTH = [0.075, 0.062, 0.065, 0.06, 0.052]; // in landmark units
const PALM = [0, 1, 2, 5, 9, 13, 17];
const CREASE_JOINTS = [3, 6, 7, 10, 11, 14, 15, 18, 19];

function fitTransform(landmarks) {
  const xs = landmarks.map((p) => p[0]);
  const ys = landmarks.map((p) => p[1]);
  const margin = 0.06;
  const minX = Math.min(...xs) - margin;
  const maxX = Math.max(...xs) + margin;
  const minY = Math.min(...ys) - margin;
  const maxY = Math.max(...ys) + 0.13; // room for the wrist below joint 0
  const boxW = PANEL_W - 2 * PAD;
  const boxH = PANEL_H - 2 * PAD;
  const s = Math.min(boxW / (maxX - minX), boxH / (maxY - minY));
  const ox = PAD + (boxW - s * (maxX - minX)) / 2 - s * minX;
  const oy = PAD + (boxH - s * (maxY - minY)) / 2 - s * minY;
  return { s, map: ([x, y]) => [ox + s * x, oy + s * y] };
}

function unit([x, y]) {
  const len = Math.hypot(x, y) || 1;
  return [x / len, y / len];
}

function polyline(P, idx) {
  return idx.map((i, k) => `${k ? "L" : "M"}${P[i][0].toFixed(1)},${P[i][1].toFixed(1)}`).join(" ");
}

function HandShape({ P, s, face }) {
  const down = unit([P[0][0] - P[9][0], P[0][1] - P[9][1]]);
  const wristEnd = [P[0][0] + down[0] * 0.12 * s, P[0][1] + down[1] * 0.12 * s];

  // Two passes: a slightly wider dark pass for the outline, then the skin
  // pass on top — overlapping strokes merge into one clean silhouette.
  const layer = (color, extra) => (
    <g key={color} stroke={color} strokeLinecap="round" strokeLinejoin="round">
      <line x1={P[0][0]} y1={P[0][1]} x2={wristEnd[0]} y2={wristEnd[1]}
        strokeWidth={0.2 * s + extra} strokeLinecap="butt" />
      <path d={`${polyline(P, PALM)} Z`} fill={color} strokeWidth={0.05 * s + extra} />
      {FINGERS.map((f, i) => (
        <path key={i} d={polyline(P, f)} fill="none" strokeWidth={FINGER_WIDTH[i] * s + extra} />
      ))}
    </g>
  );

  const details = [];
  if (face === "back") {
    // fingernails near each tip
    FINGERS.forEach((f, i) => {
      const tip = P[f[3]];
      const dir = unit([tip[0] - P[f[2]][0], tip[1] - P[f[2]][1]]);
      const w = FINGER_WIDTH[i] * s;
      const cx = tip[0] - dir[0] * w * 0.35;
      const cy = tip[1] - dir[1] * w * 0.35;
      const angle = (Math.atan2(dir[1], dir[0]) * 180) / Math.PI + 90;
      details.push(
        <rect key={`nail${i}`} x={cx - w * 0.28} y={cy - w * 0.38} width={w * 0.56} height={w * 0.7}
          rx={w * 0.2} fill="#fff" stroke={LINE} strokeWidth="1.2"
          transform={`rotate(${angle.toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)})`} />
      );
    });
  } else {
    // finger creases across each joint
    CREASE_JOINTS.forEach((j) => {
      const f = FINGERS.findIndex((fing) => fing.includes(j));
      const prev = P[j - 1];
      const dir = unit([P[j][0] - prev[0], P[j][1] - prev[1]]);
      const half = FINGER_WIDTH[f] * s * 0.28;
      details.push(
        <line key={`crease${j}`} x1={P[j][0] - dir[1] * half} y1={P[j][1] + dir[0] * half}
          x2={P[j][0] + dir[1] * half} y2={P[j][1] - dir[0] * half}
          stroke={LINE} strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
      );
    });
  }

  return (
    <g>
      {layer(LINE, 3)}
      {layer(SKIN, 0)}
      {details}
    </g>
  );
}

function HandPanel({ view, x, y, numberOf, color }) {
  const { s, map } = fitTransform(view.landmarks);
  const P = view.landmarks.map(map);
  const hits = Object.entries(view.points).filter(([label]) => numberOf.has(label));
  const faded = hits.length === 0;

  return (
    <g transform={`translate(${x},${y})`}>
      <g opacity={faded ? 0.35 : 1}>
        <HandShape P={P} s={s} face={view.face} />
        {hits.map(([label, xy]) => {
          const [cx, cy] = map(xy);
          return (
            <g key={label}>
              <circle cx={cx} cy={cy} r="11" fill={color} stroke="#fff" strokeWidth="2.5" />
              <circle cx={cx} cy={cy} r="13.5" fill="none" stroke={color} strokeWidth="1.5" />
              <text x={cx} y={cy + 4} textAnchor="middle" fontSize="12" fontWeight="800" fill="#fff">
                {numberOf.get(label)}
              </text>
            </g>
          );
        })}
      </g>
      <text x={PANEL_W / 2} y={PANEL_H - 2} textAnchor="middle" fontSize="12"
        fontWeight="700" fill={faded ? MUTED : INK} letterSpacing="0.06em">
        {view.face === "palm" ? "PALM" : "BACK"}
      </text>
    </g>
  );
}

/** Stable numbering for a problem's points, in protocol order. */
function numberPoints(protocols) {
  const numberOf = new Map();
  protocols.forEach((protocol) =>
    protocol.points.forEach((label) => {
      if (!numberOf.has(label)) numberOf.set(label, numberOf.size + 1);
    })
  );
  return numberOf;
}

const HandDiagram = forwardRef(function HandDiagram({ views, problem }, ref) {
  const numberOf = numberPoints(problem.protocols);
  const legend = [...numberOf.keys()];
  const hands = ["Left", "Right"];
  const legendRows = Math.ceil(legend.length / 2);
  const width = PANEL_W * 2;
  const rowsTop = TITLE_H;
  const rowH = ROW_LABEL_H + PANEL_H;
  const legendTop = rowsTop + rowH * hands.length + 10;
  const height = legendTop + legendRows * LEGEND_ROW_H + 18;
  const font = "Segoe UI, Helvetica, Arial, sans-serif";

  return (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${width} ${height}`}
      className="hand-diagram" role="img" fontFamily={font}
      aria-label={`Where to press for ${problem.title || problem.name}`}>
      <rect width={width} height={height} fill="#ffffff" />
      <text x={width / 2} y={30} textAnchor="middle" fontSize="19" fontWeight="800" fill={INK}>
        {problem.title || problem.name}
      </text>

      {hands.map((hand, r) => {
        const top = rowsTop + r * rowH;
        const handViews = views.filter((v) => v.hand === hand);
        return (
          <g key={hand}>
            <line x1="16" x2={width - 16} y1={top + 4} y2={top + 4} stroke="#e3e8ee" />
            <text x={width / 2} y={top + 20} textAnchor="middle" fontSize="13"
              fontWeight="800" fill={INK} letterSpacing="0.12em">
              {hand.toUpperCase()} HAND
            </text>
            {handViews.map((view, c) => (
              <HandPanel key={view.face} view={view} x={c * PANEL_W} y={top + ROW_LABEL_H}
                numberOf={numberOf} color={problem.color} />
            ))}
          </g>
        );
      })}

      {legend.map((label, i) => {
        const lx = 28 + (i % 2) * (width / 2);
        const ly = legendTop + Math.floor(i / 2) * LEGEND_ROW_H + 12;
        return (
          <g key={label}>
            <circle cx={lx} cy={ly} r="9" fill={problem.color} />
            <text x={lx} y={ly + 4} textAnchor="middle" fontSize="11" fontWeight="800" fill="#fff">
              {numberOf.get(label)}
            </text>
            <text x={lx + 16} y={ly + 4.5} fontSize="13" fill={INK}>{label}</text>
          </g>
        );
      })}
    </svg>
  );
});

export default HandDiagram;
