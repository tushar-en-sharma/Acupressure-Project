"""Django API tests for the problem-centric /api/info/ and /api/detect/
shapes. Uses the Django test client directly against the real views —
requires DJANGO_SETTINGS_MODULE, set below before any django import."""
import json
import os
import sys
from pathlib import Path

import django
import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.conf import settings  # noqa: E402
from django.test import Client  # noqa: E402

if "testserver" not in settings.ALLOWED_HOSTS:
    settings.ALLOWED_HOSTS.append("testserver")


@pytest.fixture
def client():
    return Client()


def test_api_info_exposes_problems_and_meridians(client):
    resp = client.get("/api/info/")
    assert resp.status_code == 200
    data = resp.json()
    assert "problems" in data and "points" in data and "meridians" in data
    names = {p["name"] for p in data["problems"]}
    assert "Sore Throat" in names and "Chronic Bronchitis" in names
    labels = {p["label"] for p in data["points"]}
    assert "LI4" in labels and "Lu5" in labels
    assert data["meridians"]["HT"] == "Heart"


def test_api_info_reference_views_cover_every_problem_point(client):
    """The problem diagrams are drawn from these four reference views, so
    every point any problem needs must show up in at least one of them."""
    data = client.get("/api/info/").json()
    views = data["reference_views"]
    assert {(v["hand"], v["face"]) for v in views} == {
        ("Left", "back"), ("Left", "palm"), ("Right", "back"), ("Right", "palm")}
    shown = {label for v in views for label in v["points"]}
    for problem in data["problems"]:
        for protocol in problem["protocols"]:
            for label in protocol["points"]:
                assert label in shown, f"{problem['name']}: {label} not drawable"


def test_api_detect_reports_problem_progress_from_landmarks(client):
    """/api/detect/ is what the browser calls every frame with the 21
    MediaPipe landmarks it already computed client-side — exercise it with a
    real fixture hand instead of needing a webcam."""
    with open(ROOT / "tests" / "fixtures" / "mediapipe_21_samples.json") as f:
        fixtures = json.load(f)
    landmarks = next(iter(fixtures.values()))

    resp = client.post(
        "/api/detect/",
        data=json.dumps({"hands": [{"side": "Right", "landmarks": landmarks}]}),
        content_type="application/json",
    )
    assert resp.status_code == 200
    state = resp.json()
    assert "problems" in state and "active_points" in state and "hands" in state
    assert state["hands"] == [{"side": "Right", "facing": state["hands"][0]["facing"]}]
    sore_throat = next(p for p in state["problems"] if p["name"] == "Sore Throat")
    assert sore_throat["required_points"] == ["LU11", "LI1"]
    assert isinstance(sore_throat["complete"], bool)
    assert sore_throat["color"].startswith("#")
    for point in state["active_points"]:
        assert len(point["coord"]) == 2


def test_api_detect_ignores_malformed_hands(client):
    resp = client.post(
        "/api/detect/",
        data=json.dumps({"hands": [{"side": "Sideways", "landmarks": []}]}),
        content_type="application/json",
    )
    assert resp.status_code == 200
    state = resp.json()
    assert state["hands"] == []
    assert state["active_points"] == []


def test_api_detect_handles_no_hands(client):
    resp = client.post("/api/detect/", data=json.dumps({}), content_type="application/json")
    assert resp.status_code == 200
    assert resp.json()["hands"] == []
