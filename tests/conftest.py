import json
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

FIXTURES = ROOT / "tests" / "fixtures"


@pytest.fixture(scope="session")
def hand_samples() -> dict[str, np.ndarray]:
    """{filename: (21,2) float32 array} — real MediaPipe landmarks pulled
    from annotations/mediapipe_21_points.csv, not synthetic data."""
    with open(FIXTURES / "mediapipe_21_samples.json") as f:
        raw = json.load(f)
    return {fn: np.array(pts, dtype=np.float32) for fn, pts in raw.items()}


@pytest.fixture(scope="session")
def golden_predict64() -> dict:
    with open(FIXTURES / "golden_predict64.json") as f:
        return json.load(f)
