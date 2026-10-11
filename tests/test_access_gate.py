"""Site access gate tests — the published deployment's door.

When data/app_config.json defines site_access_code, every non-GET /api call
requires the code (cookie or X-Access-Code header); only /api/access/verify is
exempt, and GET reads stay open.
"""

import pytest
from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


@pytest.fixture
def gate_enabled(monkeypatch):
    import backend.main as main

    monkeypatch.setitem(main.GATE, "disabled", False)
    monkeypatch.setattr(main, "_cached_access_code", "MUSKEG2026")
    monkeypatch.setattr(main, "_access_code_loaded", True)
    yield "MUSKEG2026"


def test_get_endpoints_stay_open(gate_enabled):
    assert client.get("/api/health").status_code == 200
    assert client.get("/api/cameras").status_code == 200


def test_mutating_calls_require_the_code(gate_enabled):
    res = client.post("/api/courses", json={"action": "delete", "course_id": "nope"})
    assert res.status_code == 401
    assert "Access code" in res.json()["detail"]

    res = client.post("/api/courses", json={"action": "delete", "course_id": "nope"},
                      headers={"X-Access-Code": "WRONG"})
    assert res.status_code == 401


def test_verify_rejects_wrong_code(gate_enabled):
    res = client.post("/api/access/verify", json={"code": "nope"})
    assert res.status_code == 401
    assert "site_access" not in res.cookies


def test_verify_sets_cookie_that_unlocks_writes(gate_enabled):
    res = client.post("/api/access/verify", json={"code": "muskeg2026 "})  # case/space tolerant
    assert res.status_code == 200
    assert res.json() == {"ok": True}
    # the browser replays the cookie automatically on every mutating call
    res = client.post("/api/courses", json={"action": "delete", "course_id": "nope"})
    assert res.status_code == 404  # past the gate — course simply doesn't exist


def test_gate_disabled_when_no_code_configured(monkeypatch):
    import backend.main as main

    monkeypatch.setitem(main.GATE, "disabled", False)
    monkeypatch.setattr(main, "_cached_access_code", None)
    monkeypatch.setattr(main, "_access_code_loaded", True)
    # no code configured (local dev) — mutating calls pass without a cookie
    res = client.post("/api/courses", json={"action": "delete", "course_id": "nope"})
    assert res.status_code == 404
