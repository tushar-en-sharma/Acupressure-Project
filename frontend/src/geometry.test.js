// Parity check: the browser geometry must match the Python backend exactly
// (to float32 precision). Fixture: python tests/make_geometry_fixture.py
// Run: node --test src/   (from frontend/)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildState, predict64 } from "./geometry.js";

const fx = JSON.parse(readFileSync(new URL("./geometry.fixture.json", import.meta.url)));
const TOL = 1e-4;

const close = (a, b, what) =>
  a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < TOL, `${what}: ${a} vs ${b}`));

test("predict64 matches core/common.py", () => {
  for (const c of fx.cases) {
    for (const h of c.hands_in) {
      const got = predict64(h.landmarks, fx.engine.point_defs);
      got.forEach((p, j) => close(p, c.pts64[h.side][j], `${c.name} ${h.side} pt${j}`));
    }
  }
});

test("buildState matches POST /api/detect/", () => {
  for (const c of fx.cases) {
    const got = buildState(c.hands_in, fx.engine, fx.problems);
    assert.deepEqual(got.hands, c.expected.hands, c.name);
    assert.deepEqual(got.active_points.map((p) => p.label), c.expected.active_points.map((p) => p.label), c.name);
    got.active_points.forEach((p, i) => {
      close(p.coord, c.expected.active_points[i].coord, `${c.name} ${p.label}`);
      assert.equal(p.color, c.expected.active_points[i].color);
    });
    const summary = (ps) => ps.map((p) => [p.name, p.found_points, p.complete]);
    assert.deepEqual(summary(got.problems), summary(c.expected.problems), c.name);
  }
});
