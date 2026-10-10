"""Per-device photo history (SQLite).

Every successful analysis can be saved with a small thumbnail; the Progress
screen lists sessions and charts score-over-time. No accounts — a random
device_id generated in the browser scopes everything.

DB: data/photo_history.db (gitignored).
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
import threading
from datetime import datetime, timezone

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from .image_utils import downscale, load_image

router = APIRouter(prefix="/api/history", tags=["history"])

_DB_PATH = None  # resolved lazily; tests re-point this
_LOCK = threading.Lock()

_SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    device_id TEXT NOT NULL,
    camera_id TEXT,
    camera_label TEXT,
    settings TEXT,
    exif TEXT,
    style_id TEXT,
    intent TEXT,
    image_hash TEXT,
    score INTEGER,
    summary TEXT,
    issues TEXT,
    provider TEXT,
    thumbnail TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_device ON sessions(device_id);
"""


def _connect() -> sqlite3.Connection:
    from pathlib import Path

    from .config import ROOT

    global _DB_PATH
    if _DB_PATH is None:
        _DB_PATH = str(ROOT / "data" / "photo_history.db")
    conn = sqlite3.connect(_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _init_db() -> None:
    with _LOCK, _connect() as conn:
        conn.executescript(_SCHEMA)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _validate_device(device_id: str) -> str:
    device_id = (device_id or "").strip()
    if not (8 <= len(device_id) <= 64):
        raise HTTPException(status_code=400, detail="device_id must be 8-64 characters.")
    return device_id


@router.post("")
async def save_session(
    device_id: str = Form(...),
    camera_id: str = Form(""),
    camera_label: str = Form(""),
    settings: str = Form("{}"),
    exif: str = Form("{}"),
    style_id: str = Form(""),
    intent: str = Form(""),
    score: int = Form(0),
    summary: str = Form(""),
    issues: str = Form("[]"),
    provider: str = Form(""),
    image: UploadFile = File(...),
):
    _init_db()
    device_id = _validate_device(device_id)
    if not 0 <= score <= 100:
        raise HTTPException(status_code=400, detail="score must be 0-100.")
    try:
        settings_dict = json.loads(settings) if settings else {}
        exif_dict = json.loads(exif) if exif else {}
        issues_list = json.loads(issues) if issues else []
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="settings/exif/issues must be valid JSON.")

    data = await image.read()
    if not data:
        raise HTTPException(status_code=400, detail="Image is required to save a session.")
    image_hash = hashlib.sha256(data).hexdigest()

    thumbnail = ""
    try:
        thumb = downscale(load_image(data), 320)
        import base64
        import io

        buf = io.BytesIO()
        thumb.save(buf, format="JPEG", quality=70)
        thumbnail = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
    except Exception:
        thumbnail = ""

    with _LOCK, _connect() as conn:
        existing = conn.execute(
            "SELECT id FROM sessions WHERE device_id = ? AND image_hash = ?",
            (device_id, image_hash),
        ).fetchone()
        if existing:
            conn.execute(
                """UPDATE sessions SET created_at=?, camera_id=?, camera_label=?, settings=?,
                   exif=?, style_id=?, intent=?, score=?, summary=?, issues=?, provider=?, thumbnail=?
                   WHERE id=?""",
                (
                    _now_iso(), camera_id, camera_label, json.dumps(settings_dict),
                    json.dumps(exif_dict), style_id, intent, score, summary,
                    json.dumps(issues_list), provider, thumbnail, existing["id"],
                ),
            )
            session_id = existing["id"]
            saved = "updated"
        else:
            cur = conn.execute(
                """INSERT INTO sessions (created_at, device_id, camera_id, camera_label, settings,
                   exif, style_id, intent, image_hash, score, summary, issues, provider, thumbnail)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    _now_iso(), device_id, camera_id, camera_label, json.dumps(settings_dict),
                    json.dumps(exif_dict), style_id, intent, image_hash, score, summary,
                    json.dumps(issues_list), provider, thumbnail,
                ),
            )
            session_id = cur.lastrowid
            saved = "created"

    return {"ok": True, "id": session_id, "saved": saved}


@router.get("")
def list_sessions(device_id: str = "", limit: int = 200):
    _init_db()
    device_id = _validate_device(device_id)
    limit = max(1, min(200, limit))
    with _LOCK, _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM sessions WHERE device_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
            (device_id, limit),
        ).fetchall()
    sessions = []
    for r in rows:
        sessions.append({
            "id": r["id"],
            "created_at": r["created_at"],
            "camera_label": r["camera_label"],
            "camera_id": r["camera_id"],
            "settings": json.loads(r["settings"] or "{}"),
            "style_id": r["style_id"],
            "intent": r["intent"],
            "score": r["score"],
            "summary": r["summary"],
            "issues": json.loads(r["issues"] or "[]"),
            "provider": r["provider"],
            "thumbnail": r["thumbnail"],
        })
    return {"sessions": sessions}


@router.delete("/{session_id}")
def delete_session(session_id: int, device_id: str = ""):
    _init_db()
    device_id = _validate_device(device_id)
    with _LOCK, _connect() as conn:
        cur = conn.execute(
            "DELETE FROM sessions WHERE id = ? AND device_id = ?", (session_id, device_id)
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Session not found.")
    return {"ok": True}
