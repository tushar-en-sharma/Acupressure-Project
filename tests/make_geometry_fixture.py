"""Regenerates frontend/src/geometry.fixture.json — expected outputs of the
Python geometry (backend/detector/camera.py) for real MediaPipe samples, which
frontend/src/geometry.test.js checks the browser port against. Re-run after
changing core/common.py, the model, or camera.py:

    python tests/make_geometry_fixture.py
"""
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "backend"))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

from detector import camera as cam  # noqa: E402

samples = json.loads((ROOT / "tests/fixtures/mediapipe_21_samples.json").read_text())
cases = []
for i, (name, pts) in enumerate(samples.items()):
    # Exercise both sides (palm/back flips with side) and a two-hand frame.
    for hands in ([{"side": "Left", "landmarks": pts}],
                  [{"side": "Right", "landmarks": pts}],
                  [{"side": "Right", "landmarks": pts},
                   {"side": "Left", "landmarks": [[1 - x, y] for x, y in pts]}]):
        state = cam.build_state(cam.hands_from_landmarks(hands))
        cases.append({"name": name, "hands_in": hands, "expected": state,
                      "pts64": {h["side"]: cam.C.predict_64(cam.np.array(h["landmarks"], dtype=cam.np.float32),
                                                            cam.POINT_DEFS).tolist() for h in hands}})

out = {"engine": cam.ENGINE, "problems": cam.PROBLEM_CATALOG, "cases": cases}
(ROOT / "frontend/src/geometry.fixture.json").write_text(json.dumps(out))
print(f"wrote {len(cases)} cases")
