import io

import httpx
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from backend.main import app

client = TestClient(app)


def jpeg_bytes(color=(100, 120, 140)):
    buf = io.BytesIO()
    Image.new("RGB", (64, 48), color).save(buf, format="JPEG")
    return buf.getvalue()


@pytest.fixture(autouse=True)
def isolated_runtime_settings(tmp_path, monkeypatch):
    import backend.runtime_config as rc

    monkeypatch.setattr(rc, "PATH", tmp_path / "runtime_settings.json")
    yield


def test_settings_roundtrip_masks_key(monkeypatch):
    saved = client.post(
        "/api/settings",
        json={"provider": "gemini", "api_key": "AIzaTESTKEY1234567890", "model": "gemini-2.0-flash"},
    )
    assert saved.status_code == 200
    body = saved.json()
    assert body["active_engine"] == "gemini"
    assert "AIzaTESTKEY1234567890" not in body["api_key"]
    assert "…7890" in body["api_key"]

    fetched = client.get("/api/settings").json()
    assert fetched["provider"] == "gemini"
    assert fetched["api_key"].startswith("AIz")


def test_settings_rejects_unknown_engine():
    res = client.post("/api/settings", json={"provider": "hal9000"})
    assert res.status_code == 400


def test_settings_clear_key():
    client.post("/api/settings", json={"provider": "openai", "api_key": "sk-test-1234567890"})
    cleared = client.post("/api/settings", json={"clear_key": True})
    assert cleared.json()["api_key"] == ""


def test_chat_deterministic_with_mock_engine():
    res = client.post(
        "/api/chat",
        data={"message": "why is my photo grainy?", "camera_id": "canon_eos_rebel_sl3",
              "settings": '{"iso": "12800"}', "style_id": "portrait"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["provider"] == "mock"
    assert "ISO 12800" in body["reply"] or "grain" in body["reply"].lower()


def test_chat_falls_back_when_ai_engine_fails(monkeypatch):
    client.post("/api/settings", json={"provider": "gemini", "api_key": "AIzaBROKENKEY123456"})

    import backend.coach.gemini_provider as gp

    def boom(*args, **kwargs):
        raise httpx.ConnectError("network down")

    monkeypatch.setattr(gp.httpx, "post", boom)
    res = client.post("/api/chat", data={"message": "what aperture for blurry backgrounds?"})
    assert res.status_code == 200
    body = res.json()
    assert body["provider"] == "mock"
    assert body["notice"]
    assert "aperture" in body["reply"].lower()


def test_chat_requires_message():
    res = client.post("/api/chat", data={"message": "  "})
    assert res.status_code == 400


def test_analyze_still_works_with_gemini_engine_selected(monkeypatch):
    client.post("/api/settings", json={"provider": "gemini", "api_key": "AIzaBROKENKEY123456"})
    import backend.coach.gemini_provider as gp

    def boom(*args, **kwargs):
        raise httpx.ConnectError("network down")

    monkeypatch.setattr(gp.httpx, "post", boom)
    res = client.post(
        "/api/analyze",
        data={"camera_id": "sony_a6400", "settings": "{}", "style_id": "portrait"},
        files={"file": ("t.jpg", jpeg_bytes(), "image/jpeg")},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["provider"] == "mock"  # fell back
    assert body["notice"]              # and says so
    assert body["analysis"]["overall_score"] >= 0


def test_restore_mock_provider():
    client.post("/api/settings", json={"provider": "mock", "clear_key": True})
    assert client.get("/api/health").json()["engine"] == "mock"
