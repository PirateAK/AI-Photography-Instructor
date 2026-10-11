"""Moderation: the coach's first pass — flagged photos never get coached,
saved, or entered into challenge galleries. Engine is stubbed in tests."""
import json

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from io import BytesIO

import backend.coach.moderation as mod
import backend.main as main_mod
from backend.main import app

client = TestClient(app)


def jpeg_bytes(color=(100, 120, 140), size=(320, 240)):
    buf = BytesIO()
    Image.new("RGB", size, color).save(buf, format="JPEG")
    return buf.getvalue()


class StubEngine:
    """Mimics GeminiProvider._generate; returns canned moderation JSON."""

    def __init__(self, flagged=False, category="adult", reason="nudity", fail=False):
        self.flagged, self.category, self.reason, self.fail = flagged, category, reason, fail
        self.calls = 0

    def _generate(self, system, contents, temperature, max_tokens, json_mode):
        self.calls += 1
        if self.fail:
            raise RuntimeError("engine down")
        return json.dumps(
            {"flagged": self.flagged, "category": self.category, "reason": self.reason}
        )


@pytest.fixture(autouse=True)
def fresh_moderation_cache():
    mod._cache.clear()
    yield
    mod._cache.clear()


def test_moderate_image_flags_and_caches(monkeypatch):
    engine = StubEngine(flagged=True, reason="nudity")
    monkeypatch.setattr(mod, "_gemini_engine", lambda: engine)

    verdict = mod.moderate_image(jpeg_bytes())
    assert verdict["flagged"] is True
    assert verdict["category"] == "adult"
    assert verdict["moderated"] is True

    # second call for the same bytes hits the cache, not the engine
    verdict2 = mod.moderate_image(jpeg_bytes())
    assert verdict2["flagged"] is True
    assert engine.calls == 1


def test_moderate_image_clean(monkeypatch):
    monkeypatch.setattr(mod, "_gemini_engine", lambda: StubEngine(flagged=False))
    verdict = mod.moderate_image(jpeg_bytes())
    assert verdict["flagged"] is False and verdict["moderated"] is True


def test_moderate_fails_open_on_engine_error(monkeypatch):
    monkeypatch.setattr(mod, "_gemini_engine", lambda: StubEngine(fail=True))
    verdict = mod.moderate_image(jpeg_bytes())
    assert verdict["flagged"] is False
    assert verdict["moderated"] is False


def test_moderate_fails_open_without_engine(monkeypatch):
    monkeypatch.setattr(mod, "_gemini_engine", lambda: None)
    verdict = mod.moderate_image(jpeg_bytes())
    assert verdict["flagged"] is False and verdict["moderated"] is False


def test_moderate_endpoint(monkeypatch):
    monkeypatch.setattr(mod, "_gemini_engine", lambda: StubEngine(flagged=False))
    res = client.post("/api/moderate", files={"file": ("t.jpg", jpeg_bytes(), "image/jpeg")})
    assert res.status_code == 200
    body = res.json()
    assert body["flagged"] is False
    assert "family-friendly" in body["terms"].lower()


def test_analyze_blocks_flagged_before_coaching(monkeypatch):
    monkeypatch.setattr(mod, "_gemini_engine", lambda: StubEngine(flagged=True, reason="nudity"))
    called = {"coach": False}

    class SpyProvider:
        name = "spy"

        def analyze(self, *a, **k):
            called["coach"] = True
            raise AssertionError("coach must never see a flagged photo")

    monkeypatch.setattr(main_mod, "provider_for_request", lambda: (SpyProvider(), "mock"))
    res = client.post(
        "/api/analyze",
        data={"camera_id": "sony_a6400"},
        files={"file": ("t.jpg", jpeg_bytes(), "image/jpeg")},
    )
    assert res.status_code == 422
    assert "CONTENT_BLOCKED" in res.json()["detail"]
    assert called["coach"] is False


def test_challenge_submit_blocks_flagged(monkeypatch):
    import backend.challenges as ch
    from datetime import datetime

    monkeypatch.setattr(ch, "_now", lambda: datetime(2026, 10, 28, 12, 0, 0))  # window open
    monkeypatch.setattr(mod, "_gemini_engine", lambda: StubEngine(flagged=True))
    res = client.post(
        "/api/challenge/submit",
        data={"device_id": "device-mod-0001", "holiday_id": "halloween", "score": 80},
        files={"image": ("t.jpg", jpeg_bytes(), "image/jpeg")},
    )
    assert res.status_code == 422
    assert "CONTENT_BLOCKED" in res.json()["detail"]
