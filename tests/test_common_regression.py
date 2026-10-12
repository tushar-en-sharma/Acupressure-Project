"""Regression tests: lock today's predict_64 output for both shipped models
against real hand samples, so the upcoming literal->constant refactor and
atlas expansion can't silently change existing point placements.

Golden values were generated once from the current (pre-refactor) code via
a throwaway script reading the same model files — see git history / plan
doc for how tests/fixtures/golden_predict64.json was produced.
"""
import numpy as np

from core import common as C


def test_geometry_51pt_matches_golden(hand_samples, golden_predict64):
    point_defs = C.load_point_defs(C.MODELS_DIR / "geometry_model_51pt.pkl")
    golden = golden_predict64["geometry_51pt"]
    for fname, pts21 in hand_samples.items():
        out = C.predict_64(pts21, point_defs)
        expected = np.array(golden[fname]["predict_64"], dtype=np.float32)
        np.testing.assert_allclose(out, expected, atol=1e-5,
                                    err_msg=f"predict_64 drifted for {fname}")


def test_v2_hybrid_matches_golden(hand_samples, golden_predict64):
    point_defs = C.load_point_defs(C.MODELS_DIR / "geometry_model_v2_hybrid.pkl")
    golden = golden_predict64["v2_hybrid"]
    for fname, pts21 in hand_samples.items():
        out = C.predict_64(pts21, point_defs)
        expected = np.array(golden[fname]["predict_64"], dtype=np.float32)
        np.testing.assert_allclose(out, expected, atol=1e-5,
                                    err_msg=f"predict_64 drifted for {fname}")


def test_model_files_unchanged_bytes():
    """Belt-and-suspenders: the plan explicitly requires never overwriting
    v1 in place. Hash check catches an accidental retrain/overwrite."""
    import hashlib
    path = C.MODELS_DIR / "geometry_model_51pt.pkl"
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    assert digest == "d7cca853589849b22db2da8d9716b078947ce204eae4b216e6822ed4d63fc94e"
