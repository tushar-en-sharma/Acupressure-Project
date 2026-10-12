"""Confirms model/annotate.py's derived point-group constants (now sourced
from core.common instead of hand-duplicated literals) still match the
original hardcoded values it shipped with."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "model"))
import annotate as A  # noqa: E402


def test_base_custom_palm_partition_the_64_points():
    assert A.BASE == set(range(0, 21))
    assert A.CUSTOM == set(range(21, 51))
    assert A.PALM == set(range(51, 64))
    assert A.BASE | A.CUSTOM | A.PALM == set(range(64))
    assert not (A.BASE & A.CUSTOM) and not (A.CUSTOM & A.PALM)


def test_acu_idx_and_label_derived_from_common():
    """annotate.py must never hand-duplicate this mapping again — it should
    always equal whatever core.common.acu_point_labels() currently derives
    from ACU_POINTS."""
    from core import common as C
    expected_idx, expected_labels = C.acu_point_labels()
    assert A.ACU_IDX == expected_idx
    assert A.ACU_LABEL == expected_labels
    # and the original 5 hand-reflex points must still be in there
    assert {27, 32, 34, 37, 59, 62, 63}.issubset(A.ACU_IDX)
