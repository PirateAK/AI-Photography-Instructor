"""Photo history API tests — DB re-pointed to tmp so the real history is safe."""

import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from backend.main import app

client = TestClient(app)

DEVICE = "test-device-12345678"


def jpeg_bytes(color=(100, 120, 140)):
    buf = io.BytesIO()
    Image.new("RGB", (64, 48), color).save(buf, format="JPEG")
    return buf.getvalue()


def save(color=(100, 120, 140), score=72, camera="canon_eos_rebel_sl3"):
    return client.post(
        "/api/history",
        data={
            "device_id": DEVICE,
            "camera_id": camera,
            "camera_label": "Canon EOS Rebel SL3",
            "settings": '{"iso": "400"}',
            "exif": "{}",
            "style_id": "portrait",
            "intent": "blurry backgrounds",
            "score": score,
            "summary": "Solid frame overall.",
            "issues": '[{"title": "Soft focus"}]',
            "provider": "mock",
        },
        files={"image": ("t.jpg", jpeg_bytes(color), "image/jpeg")},
    )


def test_save_and_list():
    res = save(score=72)
    assert res.status_code == 200
    body = res.json()
    assert body["saved"] in ("created", "updated")

    listed = client.get("/api/history", params={"device_id": DEVICE}).json()
    assert listed["sessions"][0]["score"] == 72
    assert listed["sessions"][0]["thumbnail"].startswith("data:image/jpeg;base64,")
    assert listed["sessions"][0]["summary"] == "Solid frame overall."


def test_same_image_updates_instead_of_duplicates():
    save(score=60)
    res = save(score=90)
    assert res.json()["saved"] == "updated"
    listed = client.get("/api/history", params={"device_id": DEVICE}).json()
    mine = [s for s in listed["sessions"] if s["score"] == 90]
    assert len(mine) == 1


def test_devices_are_isolated():
    save()
    other = client.get("/api/history", params={"device_id": "other-device-123456"}).json()
    assert other["sessions"] == []


def test_delete_scoped_to_device():
    res = save(score=55)
    sid = res.json()["id"]
    wrong_device = client.delete(f"/api/history/{sid}", params={"device_id": "other-device-123456"})
    assert wrong_device.status_code == 404
    ok = client.delete(f"/api/history/{sid}", params={"device_id": DEVICE})
    assert ok.status_code == 200
    assert ok.json()["ok"] is True


def test_rejects_bad_device_and_score():
    assert client.post(
        "/api/history",
        data={"device_id": "short", "score": 50},
        files={"image": ("t.jpg", jpeg_bytes(), "image/jpeg")},
    ).status_code == 400
    assert client.post(
        "/api/history",
        data={"device_id": DEVICE, "score": 900},
        files={"image": ("t.jpg", jpeg_bytes(), "image/jpeg")},
    ).status_code == 400
