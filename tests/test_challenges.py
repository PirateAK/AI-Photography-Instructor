import io
import json
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from PIL import Image

import backend.challenges as ch
from backend.main import app

client = TestClient(app)


def jpeg_bytes(color=(100, 120, 140), size=(800, 600)):
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="JPEG")
    return buf.getvalue()


def freeze(monkeypatch, iso: str):
    monkeypatch.setattr(ch, "_now", lambda: datetime.fromisoformat(iso))


def submit(device_id="device-test-0001", holiday_id="halloween", color=(100, 120, 140), score=88, files=None):
    return client.post(
        "/api/challenge/submit",
        data={"device_id": device_id, "holiday_id": holiday_id, "score": score, "camera_label": "Sony A6400"},
        files=files or {"image": ("shot.jpg", jpeg_bytes(color), "image/jpeg")},
    )


# ------------------------------------------------------------------ calendar

def test_holiday_date_rules():
    assert ch._holiday_date({"type": "nth_weekday", "month": 11, "nth": 4, "weekday": 4}, 2026) == datetime(2026, 11, 26)
    assert ch._holiday_date({"type": "easter"}, 2027) == datetime(2027, 3, 28)
    assert ch._holiday_date({"type": "fixed", "month": 10, "day": 31}, 2026) == datetime(2026, 10, 31)


def test_phase_engine():
    halloween = {"start": datetime(2026, 10, 24), "end": datetime(2026, 11, 1), "vote_end": datetime(2026, 11, 8)}
    assert ch._phase(halloween, datetime(2026, 10, 28)) == "submitting"
    assert ch._phase(halloween, datetime(2026, 11, 1)) == "submitting"
    assert ch._phase(halloween, datetime(2026, 11, 2)) == "voting"
    assert ch._phase(halloween, datetime(2026, 11, 8)) == "voting"
    assert ch._phase(halloween, datetime(2026, 11, 9)) == "results"


def test_challenge_now_env_override(monkeypatch):
    """Dev hook: CHALLENGE_NOW freezes the contest clock for out-of-season walk-throughs."""
    monkeypatch.setenv("CHALLENGE_NOW", "2026-11-04T12:00:00")
    assert ch._now() == datetime(2026, 11, 4, 12, 0, 0)
    monkeypatch.setenv("CHALLENGE_NOW", "not-a-date")
    assert ch._now().year >= 2026  # bad values fall through to real time


def test_stale_cycle_is_not_live_between_seasons(monkeypatch):    """Oct 11, 2026: last Halloween's gallery is long gone — the live cycle is the
    UPCOMING Oct 24 occurrence, not the 2025 one."""
    freeze(monkeypatch, "2026-10-11T12:00:00")
    view = client.get("/api/challenge/halloween").json()
    assert view["phase"] == "upcoming"
    assert view["submit_starts_at"].startswith("2026-10-24")
    assert view["entries_count"] == 0


# ------------------------------------------------------------------- submit

def test_submit_requires_open_window(monkeypatch):
    freeze(monkeypatch, "2026-10-28T12:00:00")
    assert submit().status_code == 200

    freeze(monkeypatch, "2026-11-04T12:00:00")  # window closed, voting open
    assert submit(color=(10, 10, 10)).status_code == 409

    freeze(monkeypatch, "2027-02-01T12:00:00")  # months later
    assert submit(color=(20, 20, 20)).status_code == 409


def test_submit_limit_three_and_duplicates(monkeypatch):
    freeze(monkeypatch, "2026-10-28T12:00:00")
    assert submit(color=(1, 2, 3)).status_code == 200
    assert submit(color=(4, 5, 6)).status_code == 200
    assert submit(color=(7, 8, 9)).status_code == 200
    assert submit(color=(10, 11, 12)).status_code == 409  # 4th entry rejected
    assert submit(color=(1, 2, 3)).status_code == 409  # exact duplicate rejected


def test_submit_rejects_corrupt_image(monkeypatch):
    freeze(monkeypatch, "2026-10-28T12:00:00")
    res = client.post(
        "/api/challenge/submit",
        data={"device_id": "device-test-0001", "holiday_id": "halloween", "score": 50},
        files={"image": ("x.jpg", b"not-an-image", "image/jpeg")},
    )
    assert res.status_code == 400


def test_view_only_stores_thumbnails(monkeypatch):
    freeze(monkeypatch, "2026-10-28T12:00:00")
    assert submit().status_code == 200
    view = client.get("/api/challenge/halloween", params={"device_id": "device-test-0001"}).json()
    assert view["phase"] == "submitting"
    assert view["entries_count"] == 1
    entry = view["entries"][0]
    assert entry["mine"] is True
    assert entry["thumb"].startswith("data:image/jpeg;base64,")
    # 640px-max thumb, never the 800px original
    import base64

    thumb = Image.open(io.BytesIO(base64.b64decode(entry["thumb"].split(",")[1])))
    assert max(thumb.size) <= 640
    assert "votes" not in entry  # vote counts hidden until results


# --------------------------------------------------------------------- vote

def test_vote_rules(monkeypatch):
    freeze(monkeypatch, "2026-10-28T12:00:00")
    assert submit(device_id="device-voter-0001", color=(30, 30, 30)).status_code == 200  # entry 1
    assert submit(device_id="device-voter-0002", color=(60, 60, 60)).status_code == 200  # entry 2
    assert submit(device_id="device-voter-0003", color=(90, 90, 90)).status_code == 200  # entry 3

    freeze(monkeypatch, "2026-10-30T12:00:00")  # still submitting
    res = client.post("/api/challenge/vote", data={"device_id": "device-voter-0002", "holiday_id": "halloween", "entry_ids": "[1]"})
    assert res.status_code == 409

    freeze(monkeypatch, "2026-11-04T12:00:00")  # voting open
    res = client.post("/api/challenge/vote", data={"device_id": "device-voter-0002", "holiday_id": "halloween", "entry_ids": "[1]"})
    assert res.status_code == 200

    # can't vote for your own entry
    res = client.post("/api/challenge/vote", data={"device_id": "device-voter-0001", "holiday_id": "halloween", "entry_ids": "[1]"})
    assert res.status_code == 400

    # replacing votes works
    res = client.post("/api/challenge/vote", data={"device_id": "device-voter-0001", "holiday_id": "halloween", "entry_ids": "[2]"})
    assert res.json()["voted"] == [2]
    res = client.post("/api/challenge/vote", data={"device_id": "device-voter-0001", "holiday_id": "halloween", "entry_ids": "[2,3]"})
    assert res.json()["voted"] == [2, 3]

    # my_votes reflected in the view
    view = client.get("/api/challenge/halloween", params={"device_id": "device-voter-0001"}).json()
    assert sorted(view["my_votes"]) == [2, 3]

    # that challenge isn't in its voting phase yet → rejected
    res = client.post("/api/challenge/vote", data={"device_id": "device-voter-0001", "holiday_id": "christmas", "entry_ids": "[1]"})
    assert res.status_code == 409


def test_results_ranking_and_visibility(monkeypatch):
    freeze(monkeypatch, "2026-10-28T12:00:00")
    assert submit(device_id="device-a-000001", color=(30, 30, 30), score=70).status_code == 200  # entry 1
    assert submit(device_id="device-b-000001", color=(60, 60, 60), score=90).status_code == 200  # entry 2
    assert submit(device_id="device-c-000001", color=(90, 90, 90), score=80).status_code == 200  # entry 3

    freeze(monkeypatch, "2026-11-04T12:00:00")  # voting open
    # two voters pick entry 2; one picks entry 3
    for voter in ("device-d-000001", "device-e-000001"):
        client.post("/api/challenge/vote", data={"device_id": voter, "holiday_id": "halloween", "entry_ids": "[2]"})
    client.post("/api/challenge/vote", data={"device_id": "device-a-000001", "holiday_id": "halloween", "entry_ids": "[3]"})

    freeze(monkeypatch, "2026-11-04T12:00:00")  # voting phase: counts hidden
    view = client.get("/api/challenge/halloween").json()
    assert all("votes" not in e for e in view["entries"])
    assert view["winners"] == []

    freeze(monkeypatch, "2026-11-12T12:00:00")  # results
    view = client.get("/api/challenge/halloween", params={"device_id": "device-b-000001"}).json()
    assert view["phase"] == "results"
    assert view["winners"][0]["entry_id"] == 2 and view["winners"][0]["place"] == 1
    assert view["winners"][0]["votes"] == 2
    assert {w["place"] for w in view["winners"]} == {1, 2}
    votes_of = {e["id"]: e["votes"] for e in view["entries"]}
    assert votes_of[2] == 2 and votes_of[3] == 1


def test_prune_when_next_window_opens(monkeypatch):
    freeze(monkeypatch, "2026-10-28T12:00:00")
    assert submit().status_code == 200
    freeze(monkeypatch, "2026-11-12T12:00:00")  # results — still there
    assert client.get("/api/challenge/halloween").json()["entries_count"] == 1
    freeze(monkeypatch, "2026-11-20T12:00:00")  # Thanksgiving window opened Nov 19
    assert client.get("/api/challenge/halloween").json()["entries_count"] == 0


# ------------------------------------------------------------------- delete

def test_delete_own_entry_while_submitting(monkeypatch):
    freeze(monkeypatch, "2026-10-28T12:00:00")
    submit(device_id="device-del-00001", color=(15, 15, 15))
    res = client.post("/api/challenge/entry/delete", data={"device_id": "device-del-00001", "entry_id": 1})
    assert res.status_code == 200
    assert client.get("/api/challenge/halloween").json()["entries_count"] == 0

    # submit a fresh entry that will still exist once the window closes
    assert submit(device_id="device-del-00001", color=(18, 18, 18)).status_code == 200

    freeze(monkeypatch, "2026-11-04T12:00:00")
    res = client.post("/api/challenge/entry/delete", data={"device_id": "device-del-00001", "entry_id": 2})
    assert res.status_code == 409  # submissions closed
    res = client.post("/api/challenge/entry/delete", data={"device_id": "device-oth-00001", "entry_id": 2})
    assert res.status_code == 403  # not theirs
