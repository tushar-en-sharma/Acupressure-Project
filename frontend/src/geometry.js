// Browser port of core/common.py's runtime geometry: predict_64,
// hand_facing, resolve_points and resolve_problems. Running these here
// (instead of POSTing every frame to /api/detect/) means the overlay is
// computed from the very frame being shown — no network round trip, so the
// dots stay on the fingers on slow mobile connections. The model and point
// atlas come from GET /api/info/ ("engine"), so the server stays the single
// source of truth for both. Kept line-for-line with the Python so the two
// can be diffed; geometry.test.js checks them against each other.

const N_TOTAL = 64;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const norm = (v) => Math.hypot(v[0], v[1]);

function geomPoint(pts21, pdf) {
  const a = pts21[pdf.anchor];
  const bone = sub(a, pts21[pdf.parent]);
  const blen = norm(bone);
  if (blen < 1e-6) return [a[0], a[1]];
  const bn = [bone[0] / blen, bone[1] / blen];
  const perp = [-bn[1], bn[0]];
  return [
    a[0] + pdf.mean_perp * blen * perp[0] + pdf.mean_along * blen * bn[0],
    a[1] + pdf.mean_perp * blen * perp[1] + pdf.mean_along * blen * bn[1],
  ];
}

function canonicalFrame(pts21) {
  const origin = pts21[0];
  const ref = sub(pts21[9], origin);
  const scale = norm(ref);
  if (scale < 1e-6) return null;
  const refDir = [ref[0] / scale, ref[1] / scale];
  return { origin, refDir, perpDir: [-refDir[1], refDir[0]], scale };
}

function ridgePoint(pts21, pdf) {
  const f = canonicalFrame(pts21);
  if (!f) return [pts21[0][0], pts21[0][1]];
  const feats = [];
  for (const p of pts21) {
    const o = [(p[0] - f.origin[0]) / f.scale, (p[1] - f.origin[1]) / f.scale];
    feats.push(o[0] * f.refDir[0] + o[1] * f.refDir[1], o[0] * f.perpDir[0] + o[1] * f.perpDir[1]);
  }
  const uv = pdf.coef.map((row, k) => row.reduce((s, c, i) => s + c * feats[i], pdf.intercept[k]));
  return [
    f.origin[0] + f.scale * (uv[0] * f.refDir[0] + uv[1] * f.perpDir[0]),
    f.origin[1] + f.scale * (uv[0] * f.refDir[1] + uv[1] * f.perpDir[1]),
  ];
}

const lerp = (...terms) => [
  terms.reduce((s, [w, p]) => s + w * p[0], 0),
  terms.reduce((s, [w, p]) => s + w * p[1], 0),
];
const clip01 = (v) => Math.min(1, Math.max(0, v));

function palmFormula(pts) {
  const [w, i, m, r, p] = [pts[0], pts[5], pts[9], pts[13], pts[17]];
  const topRow = lerp([0.25, i], [0.25, m], [0.25, r], [0.25, p]);
  const center = lerp([0.2, w], [0.2, i], [0.2, m], [0.2, r], [0.2, p]);
  const extras = [
    center,
    topRow,
    lerp([0.58, w], [0.42, topRow]),
    lerp([0.25, w], [0.55, i], [0.2, m]),
    lerp([0.25, w], [0.55, p], [0.2, r]),
    lerp([0.6, i], [0.4, m]),
    lerp([0.6, p], [0.4, r]),
    lerp([0.5, i], [0.5, p]),
    lerp([0.5, m], [0.5, r]),
    lerp([0.55, w], [0.45, i]),
    lerp([0.55, w], [0.45, p]),
  ];
  const p62 = lerp([0.5, extras[0]], [0.5, extras[3]]);
  p62[0] += 0.018 * Math.sign(extras[4][0] - extras[3][0]);
  p62[1] += 0.026;
  const p63 = [extras[7][0], extras[7][1] + 0.016];
  return [...extras, p62, p63].map(([x, y]) => [clip01(x), clip01(y)]);
}

export function predict64(pts21, pointDefs) {
  const out = pts21.map((p) => [p[0], p[1]]);
  for (let j = 21; j < N_TOTAL; j++) out.push([0, 0]);
  const defined = new Set();
  for (const [key, pdf] of Object.entries(pointDefs)) {
    const j = Number(key);
    if (j >= 21 && j < N_TOTAL) {
      out[j] = pdf.kind === "ridge" ? ridgePoint(pts21, pdf) : geomPoint(pts21, pdf);
      defined.add(j);
    }
  }
  const palm = palmFormula(out);
  for (let j = 51; j < N_TOTAL; j++) if (!defined.has(j)) out[j] = palm[j - 51];
  return out;
}

export function handFacing(pts21, side) {
  const vi = sub(pts21[5], pts21[0]);
  const vp = sub(pts21[17], pts21[0]);
  const crossZ = vi[0] * vp[1] - vi[1] * vp[0];
  if (side === "Right") return crossZ > 0 ? "palm" : "back";
  return crossZ < 0 ? "palm" : "back";
}

function formulaPoint(pts21, pdf) {
  const base = { anchor: pdf.anchor, parent: pdf.parent, mean_along: pdf.along };
  if (pdf.perp_pick_toward != null) {
    const a = geomPoint(pts21, { ...base, mean_perp: pdf.perp });
    const b = geomPoint(pts21, { ...base, mean_perp: -pdf.perp });
    const t = pts21[pdf.perp_pick_toward];
    return norm(sub(a, t)) <= norm(sub(b, t)) ? a : b;
  }
  return geomPoint(pts21, { ...base, mean_perp: pdf.perp });
}

/** hands: [{ side, pts64, facing }] in detection order. Returns the same
 * active_points list POST /api/detect/ used to: first hand to show a point wins. */
export function resolvePoints(hands, acuPoints) {
  const found = new Map();
  for (const { side, pts64, facing } of hands) {
    const pts21 = pts64.slice(0, 21);
    for (const [label, pdf] of Object.entries(acuPoints)) {
      if (pdf.face !== "any" && facing !== pdf.face) continue;
      let xy;
      if (pdf.kind === "index") {
        const idx = pdf.index[side];
        if (idx == null) continue;
        xy = pts64[idx];
      } else if (pdf.kind === "blend") {
        xy = lerp(...pdf.weights.map(([j, w]) => [w, pts21[j]]));
      } else {
        xy = formulaPoint(pts21, pdf);
      }
      const [x, y] = xy;
      if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) continue;
      if (!found.has(label)) {
        found.set(label, { label, side, coord: [x, y], system: pdf.system, meridian: pdf.meridian, color: pdf.color });
      }
    }
  }
  return [...found.values()];
}

export function resolveProblems(activePoints, problems) {
  const active = new Set(activePoints.map((p) => p.label));
  return problems.map((pdf) => {
    let best = null;
    for (const protocol of pdf.protocols) {
      const required = protocol.points;
      const found = required.filter((p) => active.has(p));
      const complete = found.length === required.length;
      if (best === null || found.length > best.found_points.length) {
        best = { required_points: required, found_points: found, complete };
      }
      if (complete) break;
    }
    return { ...pdf, ...best };
  });
}

/** Full per-frame state, same shape as POST /api/detect/'s response. */
export function buildState(handsIn, engine, problems) {
  // One entry per side (a later duplicate replaces an earlier one), like the
  // backend's {side: ...} dict.
  const bySide = new Map();
  for (const { side, landmarks } of handsIn) {
    if ((side !== "Left" && side !== "Right") || landmarks?.length !== 21) continue;
    bySide.set(side, {
      side,
      pts64: predict64(landmarks, engine.point_defs),
      facing: handFacing(landmarks, side),
    });
  }
  const hands = [...bySide.values()];
  const activePoints = resolvePoints(hands, engine.acu_points);
  return {
    hands: hands.map(({ side, facing }) => ({ side, facing })),
    active_points: activePoints,
    problems: resolveProblems(activePoints, problems),
  };
}
