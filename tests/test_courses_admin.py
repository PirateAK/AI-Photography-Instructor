"""Course Manager API tests — runs against a COPY of the real catalog."""

import json
import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)

ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture(autouse=True)
def isolated_courses_file(tmp_path, monkeypatch):
    import backend.courses_admin as ca

    copy = tmp_path / "training_courses.json"
    shutil.copy(ROOT / "data" / "training_courses.json", copy)
    monkeypatch.setattr(ca, "COURSES_PATH", copy)
    yield


def valid_course_payload():
    return {
        "id": "test_astro_101",
        "category": "Specialized",
        "title": "Astro 101 (test)",
        "cover_emoji": "🌠",
        "tagline": "Test course tagline",
        "description": "A test course used to verify the Course Manager CRUD endpoints.",
        "level": "Beginner",
        "author": "Kurtis",
        "price": "paid",
        "lessons": [
            {
                "id": "ta-1",
                "title": "First light",
                "duration_min": 6,
                "summary": "A test lesson with a complete summary for validation.",
                "video_url": "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4",
                "video_kind": "mp4",
                "difficulty": "Beginner",
                "practice_preset": {"iso": "1600", "shutter_speed": "8\"", "aperture": "f/2.8"},
                "practice_brief": "Load the night recipe and observe.",
            }
        ],
    }


def test_get_courses_returns_catalog():
    res = client.get("/api/courses")
    assert res.status_code == 200
    assert len(res.json()["courses"]) >= 12


def test_upsert_adds_and_updates():
    payload = valid_course_payload()
    added = client.post("/api/courses", json={"action": "upsert", "course": payload})
    assert added.status_code == 200
    assert any(c["id"] == "test_astro_101" for c in added.json()["courses"])

    payload["title"] = "Astro 101 (renamed)"
    updated = client.post("/api/courses", json={"action": "upsert", "course": payload})
    assert updated.status_code == 200
    titles = [c["title"] for c in updated.json()["courses"] if c["id"] == "test_astro_101"]
    assert titles == ["Astro 101 (renamed)"]


def test_upsert_rejects_bad_preset_shutter():
    payload = valid_course_payload()
    payload["lessons"][0]["practice_preset"]["shutter_speed"] = "fast"
    res = client.post("/api/courses", json={"action": "upsert", "course": payload})
    assert res.status_code == 400
    assert "shutter_speed" in res.json()["detail"]


def test_upsert_rejects_duplicate_lesson_ids():
    payload = valid_course_payload()
    payload["lessons"].append(dict(payload["lessons"][0]))
    res = client.post("/api/courses", json={"action": "upsert", "course": payload})
    assert res.status_code == 400


def test_delete_and_missing():
    added = client.post("/api/courses", json={"action": "upsert", "course": valid_course_payload()})
    assert added.status_code == 200
    deleted = client.post("/api/courses", json={"action": "delete", "course_id": "test_astro_101"})
    assert deleted.status_code == 200
    missing = client.post("/api/courses", json={"action": "delete", "course_id": "test_astro_101"})
    assert missing.status_code == 404


def test_generate_requires_ai_engine():
    res = client.post("/api/courses/generate", json={"topic": "Night photography"})
    assert res.status_code == 400
    assert "Setup page" in res.json()["detail"]
