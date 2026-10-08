import io
import json

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from backend.main import app

client = TestClient(app)


def jpeg_bytes(color=(100, 120, 140), size=(64, 48)):
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="JPEG")
    return buf.getvalue()


def test_health():
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_cameras_endpoint_has_three_models():
    res = client.get("/api/cameras")
    assert res.status_code == 200
    cameras = res.json()["cameras"]
    assert len(cameras) >= 3
    ids = {c["id"] for c in cameras}
    assert {"canon_eos_rebel_sl3", "sony_a6400", "nikon_z50"} <= ids


def test_exif_endpoint_returns_has_exif_false_for_plain_jpeg():
    res = client.post("/api/exif", files={"file": ("t.jpg", jpeg_bytes(), "image/jpeg")})
    assert res.status_code == 200
    assert res.json()["has_exif"] is False


def test_analyze_validates_and_caches():
    data = jpeg_bytes()
    form = {
        "camera_id": "sony_a6400",
        "settings": json.dumps({"iso": "400", "shutter_speed": "1/125", "aperture": "f/4.0"}),
        "intent": "",
    }
    files = {"file": ("t.jpg", data, "image/jpeg")}

    first = client.post("/api/analyze", data=form, files=files)
    assert first.status_code == 200
    body = first.json()
    assert body["cached"] is False
    assert body["provider"] == "mock"
    assert 0 <= body["analysis"]["overall_score"] <= 100
    assert len(body["analysis"]["practice_exercises"]) == 3
    assert body["chat_response"]

    second = client.post("/api/analyze", data=form, files=files)
    assert second.status_code == 200
    assert second.json()["cached"] is True

    different = client.post(
        "/api/analyze",
        data={**form, "settings": json.dumps({"iso": "800"})},
        files=files,
    )
    assert different.json()["cached"] is False


def test_analyze_rejects_unknown_camera():
    res = client.post(
        "/api/analyze",
        data={"camera_id": "does_not_exist"},
        files={"file": ("t.jpg", jpeg_bytes(), "image/jpeg")},
    )
    assert res.status_code == 400


def test_analyze_rejects_corrupt_image():
    res = client.post(
        "/api/analyze",
        data={"camera_id": "sony_a6400"},
        files={"file": ("t.jpg", b"not-an-image", "image/jpeg")},
    )
    assert res.status_code == 400


def test_oversize_upload_rejected(monkeypatch):
    import backend.main as m

    monkeypatch.setattr(m, "MAX_UPLOAD_BYTES", 16)
    res = client.post("/api/exif", files={"file": ("t.jpg", jpeg_bytes(), "image/jpeg")})
    assert res.status_code == 413
    assert "smaller" in res.json()["detail"].lower()


def test_invalid_settings_json_rejected():
    res = client.post(
        "/api/analyze",
        data={"camera_id": "sony_a6400", "settings": "{not json"},
        files={"file": ("t.jpg", jpeg_bytes(), "image/jpeg")},
    )
    assert res.status_code == 400
