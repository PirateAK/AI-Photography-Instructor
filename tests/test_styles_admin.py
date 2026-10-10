"""Style Manager API tests — runs against a COPY of the real catalog so the
developer's data/shooting_styles.json is never modified by tests."""

import json
import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)

ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture(autouse=True)
def isolated_styles_file(tmp_path, monkeypatch):
    import backend.styles_admin as sa

    copy = tmp_path / "shooting_styles.json"
    shutil.copy(ROOT / "data" / "shooting_styles.json", copy)
    monkeypatch.setattr(sa, "STYLES_PATH", copy)
    yield


def valid_style_payload():
    return {
        "id": "test_macro",
        "label": "Test Macro",
        "emoji": "🔬",
        "description": "Close-up photography of tiny subjects.",
        "level": "Intermediate",
        "recipe": {
            "summary": "Stop down and stabilize for tiny subjects.",
            "settings": {"aperture": "f/8.0", "shutter_speed": "1/125", "iso": "200"},
            "why": "Macro magnifies shake and shrinks depth of field, so mid apertures and fast shutters keep detail.",
        },
        "priorities": {"sharpness": 1.5, "noise": 0.8},
        "rules": {"aperture_target": "f/8.0"},
        "watch_fors": ["Shake at high magnification", "Working distance too short"],
        "exercises": [
            {"title": "Coin hunt", "goal": "Sharply capture a coin at 1:1.", "how": "Use a tripod and live view magnification."},
            {"title": "Focus stack lite", "goal": "Two frames, front and back focus.", "how": "Blend by eye in any editor."},
        ],
    }


def test_get_styles_returns_catalog():
    res = client.get("/api/styles")
    assert res.status_code == 200
    assert len(res.json()["styles"]) >= 6


def test_upsert_adds_and_updates():
    payload = valid_style_payload()
    added = client.post("/api/styles", json={"action": "upsert", "style": payload})
    assert added.status_code == 200
    assert any(s["id"] == "test_macro" for s in added.json()["styles"])

    payload["label"] = "Renamed Macro"
    updated = client.post("/api/styles", json={"action": "upsert", "style": payload})
    assert updated.status_code == 200
    labels = [s["label"] for s in updated.json()["styles"] if s["id"] == "test_macro"]
    assert labels == ["Renamed Macro"]  # updated in place, not duplicated


def test_upsert_rejects_bad_rule_values():
    payload = valid_style_payload()
    payload["rules"]["shutter_floor"] = "faster-please"
    res = client.post("/api/styles", json={"action": "upsert", "style": payload})
    assert res.status_code == 400
    assert "shutter_floor" in res.json()["detail"]


def test_upsert_rejects_missing_exercise():
    payload = valid_style_payload()
    payload["exercises"] = payload["exercises"][:1]
    res = client.post("/api/styles", json={"action": "upsert", "style": payload})
    assert res.status_code in (400, 422)


def test_upsert_rejects_unknown_priority():
    payload = valid_style_payload()
    payload["priorities"] = {"vibes": 2.0}
    res = client.post("/api/styles", json={"action": "upsert", "style": payload})
    assert res.status_code == 400
    assert "vibes" in res.json()["detail"]


def test_delete_and_last_style_guard():
    added = client.post("/api/styles", json={"action": "upsert", "style": valid_style_payload()})
    assert added.status_code == 200

    deleted = client.post("/api/styles", json={"action": "delete", "style_id": "test_macro"})
    assert deleted.status_code == 200
    assert not any(s["id"] == "test_macro" for s in deleted.json()["styles"])

    missing = client.post("/api/styles", json={"action": "delete", "style_id": "test_macro"})
    assert missing.status_code == 404


def test_generate_requires_ai_engine():
    # runtime settings are isolated per-test (conftest) -> engine resolves to mock
    res = client.post("/api/styles/generate", json={"name": "Macro"})
    assert res.status_code == 400
    assert "Setup page" in res.json()["detail"]


def test_generate_lessons_requires_ai_engine():
    res = client.post("/api/styles/generate-lessons", json={"style_id": "landscape"})
    assert res.status_code == 400
    assert "No AI engine" in res.json()["detail"]


def _valid_lesson_draft():
    return {
        "lessons": [
            {
                "id": "landscape-1",
                "title": "Protect the sky",
                "description": "Feel the sky-vs-land exposure gap and fix it.",
                "steps": [
                    {"settingId": "exposure_comp", "value": -0.7, "narration": "Pull the sky back from the right wall.", "why": "Highlights are the contract in landscapes."},
                    {"settingId": "aperture", "value": "f/11", "narration": "Deepen focus front to back."},
                ],
                "practice_brief": "Watch the histogram right edge unhook as you step down.",
                "draft": True,
            }
        ]
    }


def test_generate_lessons_returns_draft_without_saving(monkeypatch):
    import backend.styles_admin as sa
    from backend.coach import style_generator

    monkeypatch.setattr(style_generator, "draft_style_lessons", lambda style: _valid_lesson_draft())
    before = sa.STYLES_PATH.read_text(encoding="utf-8")
    res = client.post("/api/styles/generate-lessons", json={"style_id": "landscape"})
    assert res.status_code == 200
    body = res.json()
    assert body["validation_errors"] == []
    assert body["draft_lessons"][0]["id"] == "landscape-1"
    # file untouched — drafts are review-only
    assert sa.STYLES_PATH.read_text(encoding="utf-8") == before


def test_generate_lessons_unknown_style_404(monkeypatch):
    from backend.coach import style_generator

    monkeypatch.setattr(style_generator, "draft_style_lessons", lambda style: _valid_lesson_draft())
    res = client.post("/api/styles/generate-lessons", json={"style_id": "nope"})
    assert res.status_code == 404


def test_upsert_approves_generated_lessons():
    style = valid_style_payload()
    style["lessons"] = _valid_lesson_draft()["lessons"]
    res = client.post("/api/styles", json={"action": "upsert", "style": style})
    assert res.status_code == 200
    saved = next(s for s in res.json()["styles"] if s["id"] == "test_macro")
    assert saved["lessons"][0]["id"] == "landscape-1"
    assert saved["lessons"][0]["steps"][0]["settingId"] == "exposure_comp"


def test_upsert_rejects_lesson_steps_that_cannot_apply():
    style = valid_style_payload()
    lessons = _valid_lesson_draft()["lessons"]
    lessons[0]["steps"][1]["value"] = "banana"  # not an aperture
    style["lessons"] = lessons
    res = client.post("/api/styles", json={"action": "upsert", "style": style})
    assert res.status_code == 400
    assert "aperture" in res.json()["detail"]

    style = valid_style_payload()
    lessons = _valid_lesson_draft()["lessons"]
    lessons[0]["steps"][0]["settingId"] = "gain"  # not a real camera setting
    style["lessons"] = lessons
    res = client.post("/api/styles", json={"action": "upsert", "style": style})
    assert res.status_code == 400
    assert "unknown setting" in res.json()["detail"]
