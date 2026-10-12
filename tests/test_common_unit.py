"""Unit tests for the pure geometry helpers in core/common.py.

These are the functions the whole atlas-expansion plan builds on, so they
need a safety net before any new point formulas are added on top of them.
"""
import numpy as np
import pytest

from core import common as C


def _square_hand():
    """A tiny synthetic 21-point hand: wrist at origin, straight fingers
    along +y, spread along +x. Not realistic, but exact and easy to reason
    about for pure-math checks (real hands are covered by the regression
    fixtures in test_common_regression.py)."""
    pts = np.zeros((21, 2), dtype=np.float32)
    pts[0] = [0.5, 0.5]     # wrist
    pts[5] = [0.4, 0.3]     # index MCP
    pts[9] = [0.5, 0.2]     # middle MCP
    pts[13] = [0.6, 0.3]    # ring MCP
    pts[17] = [0.7, 0.4]    # pinky MCP
    return pts


class TestGeomPointRoundTrip:
    def test_decompose_is_inverse_of_geom_point(self):
        pts = _square_hand()
        anchor, parent = 9, 0
        target = np.array([0.52, 0.18], dtype=np.float32)
        perp, along = C.decompose(pts, target, anchor, parent)
        pdf = {"anchor": anchor, "parent": parent, "mean_perp": perp, "mean_along": along}
        recovered = C._geom_point(pts, pdf)
        np.testing.assert_allclose(recovered, target, atol=1e-5)

    def test_geom_point_degenerate_bone_returns_anchor(self):
        pts = _square_hand()
        pts[9] = pts[0]  # zero-length anchor->parent bone
        pdf = {"anchor": 9, "parent": 0, "mean_perp": 1.0, "mean_along": 1.0}
        out = C._geom_point(pts, pdf)
        np.testing.assert_array_equal(out, pts[9])


class TestCanonicalFrame:
    def test_round_trip_to_from_canonical(self):
        pts = _square_hand()
        frame = C.hand_canonical_frame(pts)
        uv = C.to_canonical(pts[9], frame)
        back = C.from_canonical(uv, frame)
        np.testing.assert_allclose(back, pts[9], atol=1e-5)

    def test_degenerate_hand_returns_none(self):
        pts = _square_hand()
        pts[9] = pts[0]  # zero scale (wrist == middle MCP)
        assert C.hand_canonical_frame(pts) is None

    def test_features_42_is_none_for_degenerate_hand(self):
        pts = _square_hand()
        pts[9] = pts[0]
        assert C.hand_features_42(pts) is None


class TestHandFacing:
    @pytest.mark.parametrize("side,expected", [("Right", "palm"), ("Left", "back")])
    def test_facing_sign_flips_with_side(self, side, expected):
        pts = _square_hand()  # index(5) left of pinky(17) relative to wrist -> cross_z > 0
        assert C.hand_facing(pts, side) == expected

    def test_facing_is_opposite_for_mirrored_hand(self):
        pts = _square_hand()
        assert C.hand_facing(pts, "Right") != C.hand_facing(pts, "Left")


class TestAcuPointLabels:
    def test_original_five_unchanged(self):
        """The original 5 hand-reflex points must keep their exact indices
        and (L)/(R) suffix behaviour through the atlas expansion."""
        idx, labels = C.acu_point_labels()
        for j in (27, 32, 34, 37, 59, 62, 63):
            assert j in idx
        assert labels[27] == "Lu5 (R)" and labels[32] == "Lu5 (L)"
        assert labels[34] == "BL60 (R)" and labels[37] == "BL60 (L)"
        assert labels[59] == "GV1" and labels[62] == "CV8" and labels[63] == "CV4"

    def test_shared_index_joins_both_labels(self):
        """SI1 and HT9 are both real points at the pinky-fingertip landmark
        (20) — opposite corners of the nail, indistinguishable at this
        landmark resolution — so the derived label must mention both."""
        _, labels = C.acu_point_labels()
        assert "SI1" in labels[20] and "HT9" in labels[20]

    def test_every_index_kind_point_resolves(self):
        idx, _ = C.acu_point_labels()
        for pdf in C.ACU_POINTS.values():
            if pdf["kind"] != "index":
                continue
            for j in pdf["index"].values():
                assert j in idx

    def test_formula_points_excluded_from_index_map(self):
        """LI4/HT7 aren't slots in the 64-point array, so they must not leak
        into the annotator's index-based highlighting."""
        idx, labels = C.acu_point_labels()
        assert not any(v.startswith("LI4") or v.startswith("HT7") for v in labels.values())


class TestResolvePointsAndProblems:
    def _hands_dict(self, hand_samples, side="Right", facing="palm"):
        point_defs = C.load_point_defs()
        pts21 = next(iter(hand_samples.values()))
        pts64 = C.predict_64(pts21, point_defs)
        return {side: (pts64, facing)}

    def test_resolve_points_respects_face_gate(self, hand_samples):
        hands_dict = self._hands_dict(hand_samples, facing="palm")
        active = C.resolve_points(hands_dict)
        for label in active:
            assert C.ACU_POINTS[label]["face"] in ("palm", "any")

    def test_single_point_problem_completes(self, hand_samples):
        hands_dict = self._hands_dict(hand_samples, facing="palm")
        active = C.resolve_points(hands_dict)
        problems = {p["name"]: p for p in C.resolve_problems(active)}
        assert problems["Chronic Bronchitis"]["complete"] == ("Lu5" in active)

    def test_multi_point_problem_requires_all_points(self, hand_samples):
        hands_dict = self._hands_dict(hand_samples, facing="back")
        active = C.resolve_points(hands_dict)
        problems = {p["name"]: p for p in C.resolve_problems(active)}
        sore_throat = problems["Sore Throat"]
        assert sore_throat["required_points"] == ["LU11", "LI1"]
        assert sore_throat["complete"] == all(p in active for p in ["LU11", "LI1"])

    def test_multi_point_problem_incomplete_without_all_points(self):
        """A partial set of the required points must never read as solved —
        the whole point of "multi-point" is that a subset doesn't count."""
        active = {"LU11": {"side": "Right", "coord": (0.1, 0.1),
                            "system": "hand_acupoint", "meridian": "LU"}}
        problems = {p["name"]: p for p in C.resolve_problems(active)}
        assert problems["Sore Throat"]["found_points"] == ["LU11"]
        assert problems["Sore Throat"]["complete"] is False

    def test_alternative_protocols_either_solves_it(self):
        """Headache has two independent single-point protocols (CV4 or LI4)
        — either alone must be enough."""
        problems = {p["name"]: p for p in C.resolve_problems({"CV4": {}})}
        assert problems["Headache"]["complete"] is True
        problems = {p["name"]: p for p in C.resolve_problems({"LI4": {}})}
        assert problems["Headache"]["complete"] is True
        problems = {p["name"]: p for p in C.resolve_problems({})}
        assert problems["Headache"]["complete"] is False

    def test_every_problem_protocol_references_real_points(self):
        for name, pdf in C.PROBLEMS.items():
            for protocol in pdf["protocols"]:
                for label in protocol["points"]:
                    assert label in C.ACU_POINTS, f"{name} references unknown point {label}"


class TestSuJok:
    def test_blend_weights_sum_to_one(self):
        for label, pdf in C.ACU_POINTS.items():
            if pdf["kind"] == "blend":
                assert abs(sum(pdf["weights"].values()) - 1.0) < 1e-9, label

    def test_blend_point_is_weighted_average(self, hand_samples):
        pts21 = next(iter(hand_samples.values()))
        head = C._blend_point(pts21, C.ACU_POINTS["SJ Head-Front"])
        np.testing.assert_allclose(head, (pts21[3] + pts21[4]) / 2, atol=1e-6)

    def test_limb_points_follow_body_side(self):
        """MediaPipe "Left" is the user's right hand: there the right knee is
        the middle finger's PIP (10); on the user's left hand ("Right") it is
        the ring finger's PIP (14). Left knee is the mirror image."""
        assert C.ACU_POINTS["SJ Right Knee"]["index"] == {"Left": 10, "Right": 14}
        assert C.ACU_POINTS["SJ Left Knee"]["index"] == {"Left": 14, "Right": 10}
        assert C.ACU_POINTS["SJ Right Shoulder"]["index"] == {"Left": 5, "Right": 17}

    def test_any_face_points_show_on_both_faces(self, hand_samples):
        point_defs = C.load_point_defs()
        pts21 = next(iter(hand_samples.values()))
        pts64 = C.predict_64(pts21, point_defs)
        for facing in ("palm", "back"):
            active = C.resolve_points({"Left": (pts64, facing)})
            assert "SJ Right Knee" in active
            np.testing.assert_allclose(active["SJ Right Knee"]["coord"], pts21[10], atol=1e-6)

    def test_joint_pain_solved_by_either_body_side(self):
        problems = {p["name"]: p for p in C.resolve_problems({"SJ Left Knee": {}})}
        assert problems["Su Jok: Knee Pain"]["complete"] is True
        assert problems["Su Jok: Knee Pain"]["required_points"] == ["SJ Left Knee"]
        assert problems["Su Jok: Knee Pain"]["title"] == "Knee Pain"

    def test_su_jok_problems_use_only_su_jok_points(self):
        """The Su Jok section is self-contained: its problems use only Su Jok
        points, and no classical problem borrows a Su Jok point."""
        for name, pdf in C.PROBLEMS.items():
            labels = {p for protocol in pdf["protocols"] for p in protocol["points"]}
            is_sj = pdf["system"] == "su_jok"
            assert all((C.ACU_POINTS[p]["system"] == "su_jok") == is_sj for p in labels), name


class TestPredict64Shape:
    def test_output_shape_and_base_passthrough(self, hand_samples):
        pts21 = next(iter(hand_samples.values()))
        point_defs = C.load_point_defs()
        out = C.predict_64(pts21, point_defs)
        assert out.shape == (C.N_TOTAL, 2)
        np.testing.assert_array_equal(out[:21], pts21)

    def test_palm_points_stay_in_unit_range(self, hand_samples):
        pts21 = next(iter(hand_samples.values()))
        point_defs = C.load_point_defs()
        out = C.predict_64(pts21, point_defs)
        palm = out[list(C.PALM_RANGE)]
        assert np.all(palm >= 0.0) and np.all(palm <= 1.0)
