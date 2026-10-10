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
