"""Holiday challenge contest — shared photo entries + voting (SQLite).

One SQLite DB (data/challenge_entries.db, gitignored) holds every challenge's
entries and votes. Only 640px thumbnails are ever stored or served — full-res
originals stay on the photographer's device (in their IndexedDB gallery), so
other people's photos cannot be downloaded from the app.

Schedule (all derived from data/holidays.json — no manual maintenance):
  submitting: holiday window (7 days before → 1 day after)
  voting:     7 days after the window closes
  results:    winner announced, gallery persists until the NEXT holiday window
              opens, then entries for the finished challenge are pruned.
"""
from __future__ import annotations

import base64
import io
import json
import os
import sqlite3
import threading
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from .config import ROOT
from .image_utils import downscale, load_image

router = APIRouter(prefix="/api/challenge", tags=["challenge"])

_DB_PATH = None  # resolved lazily; tests re-point this
_LOCK = threading.Lock()

CHALLENGE_MAX_BYTES = 12 * 1024 * 1024
MAX_ENTRIES_PER_DEVICE = 3
MAX_VOTES = 3
VOTING_DAYS = 7
THUMB_DIM = 640

_SCHEMA = """
CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    holiday_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    camera_label TEXT DEFAULT '',
    image BLOB NOT NULL,
    image_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entries_holiday ON entries(holiday_id);
CREATE TABLE IF NOT EXISTS votes (
    entry_id INTEGER NOT NULL,
    device_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (entry_id, device_id)
);
CREATE INDEX IF NOT EXISTS idx_votes_device ON votes(device_id);
"""

# ------------------------------------------------------------------ calendar


def _load_holidays() -> list[dict]:
    return json.loads((ROOT / "data" / "holidays.json").read_text())["holidays"]


def _easter(year: int) -> datetime:
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = (h + l - 7 * m + 114) % 31 + 1
    return datetime(year, month, day)


def _holiday_date(rule: dict, year: int) -> datetime | None:
    kind = rule.get("type")
    if kind == "fixed":
        return datetime(year, rule["month"], rule["day"])
    if kind == "nth_weekday":
        # JSON weekday uses the JS convention (0 = Sunday); Python's is Monday-based.
        target = (rule["weekday"] + 6) % 7
        first_wd = datetime(year, rule["month"], 1).weekday()
        shift = (target - first_wd) % 7
        day = 1 + shift + (rule["nth"] - 1) * 7
        try:
            return datetime(year, rule["month"], day)
        except ValueError:
            return None
    if kind == "easter":
        return _easter(year)
    return None


def _windows(now: datetime) -> list[dict]:
    """Every holiday occurrence with its full schedule for years around `now`."""
    out = []
    for year in (now.year - 1, now.year, now.year + 1):
        for h in _load_holidays():
            date = _holiday_date(h["rule"], year)
            if not date:
                continue
            start = date - timedelta(days=7)
            end = date + timedelta(days=1)
            out.append({
                "id": h["id"],
                "name": h["name"],
                "emoji": h["emoji"],
                "challenge": h["challenge"]["title"],
                "start": start,
                "end": end,
                "vote_end": end + timedelta(days=VOTING_DAYS),
            })
    return out


def _now() -> datetime:
    # Dev/demo hook: CHALLENGE_NOW=2026-11-04 walks voting/results out of season.
    override = os.getenv("CHALLENGE_NOW", "")
    if override:
        try:
            return datetime.fromisoformat(override)
        except ValueError:
            pass
    return datetime.now()


def _past_cycle(now: datetime, holiday_id: str) -> dict | None:
    """The most recent occurrence that has started (its gallery may be expired)."""
    ws = [w for w in _windows(now) if w["id"] == holiday_id and w["start"] <= now]
    return max(ws, key=lambda w: w["start"]) if ws else None


def _gallery_end(w: dict) -> datetime | None:
    """A finished challenge's gallery lives until the next holiday window opens."""
    return _next_window_start(w["end"])


def _cycle(now: datetime, holiday_id: str) -> dict | None:
    """The live schedule block for this holiday: the running cycle, else the next upcoming one."""
    past = _past_cycle(now, holiday_id)
    if past:
        end = _gallery_end(past)
        if not end or now < end:
            return past
    future = [w for w in _windows(now) if w["id"] == holiday_id and w["start"] > now]
    return min(future, key=lambda w: w["start"]) if future else None


def _phase(w: dict, now: datetime) -> str:
    if now < w["start"]:
        return "upcoming"
    if now <= w["end"]:
        return "submitting"
    if now <= w["vote_end"]:
        return "voting"
    return "results"


def _next_window_start(now: datetime) -> datetime | None:
    future = [w["start"] for w in _windows(now) if w["start"] > now]
    return min(future) if future else None


# ---------------------------------------------------------------------- db


def _connect() -> sqlite3.Connection:
    global _DB_PATH
    if _DB_PATH is None:
        _DB_PATH = str(ROOT / "data" / "challenge_entries.db")
    conn = sqlite3.connect(_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _init_db() -> None:
    with _LOCK, _connect() as conn:
        conn.executescript(_SCHEMA)


def _prune(conn: sqlite3.Connection, now: datetime) -> None:
    """Drop a finished challenge's gallery the moment the next window opens."""
    known = {w["id"] for w in _windows(now)}
    for row in conn.execute("SELECT DISTINCT holiday_id FROM entries").fetchall():
        holiday_id = row["holiday_id"]
        if holiday_id not in known:
            conn.execute("DELETE FROM entries WHERE holiday_id = ?", (holiday_id,))
            continue
        past = _past_cycle(now, holiday_id)
        if not past:
            continue
        end = _gallery_end(past)
        if end and now >= end:
            conn.execute(
                "DELETE FROM votes WHERE entry_id IN (SELECT id FROM entries WHERE holiday_id = ?)",
                (holiday_id,),
            )
            conn.execute("DELETE FROM entries WHERE holiday_id = ?", (holiday_id,))


def _thumb_data_url(data: bytes) -> tuple[bytes, str, int, int]:
    """640px JPEG bytes + a data URL for serving. Raises on unreadable images."""
    img = load_image(data)
    small = downscale(img, THUMB_DIM)
    buf = io.BytesIO()
    small.save(buf, format="JPEG", quality=80)
    jpg = buf.getvalue()
    url = "data:image/jpeg;base64," + base64.b64encode(jpg).decode("ascii")
    return jpg, url, img.size[0], img.size[1]


def _validate_device(device_id: str) -> str:
    device_id = (device_id or "").strip()
    if not (8 <= len(device_id) <= 64):
        raise HTTPException(status_code=400, detail="device_id must be 8-64 characters.")
    return device_id


def _entry_row(e: sqlite3.Row, votes: int | None, mine: bool) -> dict:
    out = {
        "id": e["id"],
        "score": e["score"],
        "camera_label": e["camera_label"],
        "created_at": e["created_at"],
        "mine": mine,
        "thumb": "data:image/jpeg;base64," + base64.b64encode(e["image"]).decode("ascii"),
    }
    if votes is not None:
        out["votes"] = votes
    return out


# ----------------------------------------------------------------- endpoints


@router.get("/{holiday_id}")
async def challenge_view(holiday_id: str, device_id: str = ""):
    """Everything the challenge screen needs: phase, schedule, entries, my votes."""
    _init_db()
    now = _now()
    w = _cycle(now, holiday_id)
    if not w:
        raise HTTPException(status_code=404, detail="Unknown holiday challenge.")
    phase = _phase(w, now)
    device_id = (device_id or "").strip()

    next_start = _next_window_start(now)
    with _LOCK, _connect() as conn:
        _prune(conn, now)
        rows = conn.execute(
            "SELECT e.*, (SELECT COUNT(*) FROM votes v WHERE v.entry_id = e.id) AS votes "
            "FROM entries e WHERE e.holiday_id = ? ORDER BY e.created_at ASC, e.id ASC",
            (holiday_id,),
        ).fetchall()

    mine_ids = {r["id"] for r in rows if device_id and r["device_id"] == device_id}
    show_votes = phase == "results"
    entries = [_entry_row(r, r["votes"] if show_votes else None, r["id"] in mine_ids) for r in rows]

    my_votes: list[int] = []
    if device_id:
        with _LOCK, _connect() as conn:
            my_votes = [
                r["entry_id"]
                for r in conn.execute(
                    "SELECT entry_id FROM votes WHERE device_id = ? AND entry_id IN "
                    "(SELECT id FROM entries WHERE holiday_id = ?)",
                    (device_id, holiday_id),
                ).fetchall()
            ]

    winners = []
    if show_votes and rows:
        ranked = sorted(rows, key=lambda r: (-r["votes"], -r["score"], r["created_at"], r["id"]))
        for place, r in enumerate(ranked[:3], start=1):
            if r["votes"] > 0 or place == 1:
                winners.append({"entry_id": r["id"], "place": place, "votes": r["votes"]})

    return {
        "holiday_id": holiday_id,
        "name": w["name"],
        "emoji": w["emoji"],
        "challenge_title": w["challenge"],
        "phase": phase,
        "submit_starts_at": w["start"].isoformat(timespec="seconds"),
        "submit_ends_at": w["end"].isoformat(timespec="seconds"),
        "vote_ends_at": w["vote_end"].isoformat(timespec="seconds"),
        "gallery_resets_at": next_start.isoformat(timespec="seconds") if next_start else None,
        "resets_in_days": max(0, (next_start - now).days) if next_start else None,
        "entries_count": len(entries),
        "entries": entries,
        "my_entries": sorted(mine_ids),
        "my_votes": my_votes,
        "winners": winners,
    }


@router.post("/submit")
async def submit_entry(
    device_id: str = Form(...),
    holiday_id: str = Form(...),
    score: int = Form(0),
    camera_label: str = Form(""),
    image: UploadFile = File(...),
):
    _init_db()
    device_id = _validate_device(device_id)
    now = _now()
    w = _cycle(now, holiday_id)
    if not w:
        raise HTTPException(status_code=404, detail="Unknown holiday challenge.")
    if _phase(w, now) != "submitting":
        raise HTTPException(status_code=409, detail="Submissions are closed for this challenge.")

    data = await image.read()
    if not data:
        raise HTTPException(status_code=400, detail="Image is required.")
    if len(data) > CHALLENGE_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Image too large (12 MB max).")
    try:
        jpg, url, _w, _h = _thumb_data_url(data)
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read that file as an image (JPG/PNG expected).")

    # shared gallery is moderated server-side — the client check is not trusted
    from .coach.moderation import BLOCKED_MESSAGE, moderate_image

    verdict = moderate_image(data)
    if verdict["flagged"]:
        raise HTTPException(status_code=422, detail=f"CONTENT_BLOCKED: {BLOCKED_MESSAGE}")

    if not 0 <= score <= 100:
        raise HTTPException(status_code=400, detail="score must be 0-100.")

    import hashlib

    image_hash = hashlib.sha256(data).hexdigest()
    with _LOCK, _connect() as conn:
        count = conn.execute(
            "SELECT COUNT(*) AS n FROM entries WHERE holiday_id = ? AND device_id = ?",
            (holiday_id, device_id),
        ).fetchone()["n"]
        if count >= MAX_ENTRIES_PER_DEVICE:
            raise HTTPException(
                status_code=409,
                detail=f"Limit reached — {MAX_ENTRIES_PER_DEVICE} entries per challenge.",
            )
        dup = conn.execute(
            "SELECT id FROM entries WHERE holiday_id = ? AND device_id = ? AND image_hash = ?",
            (holiday_id, device_id, image_hash),
        ).fetchone()
        if dup:
            raise HTTPException(status_code=409, detail="That photo is already in this challenge.")
        cur = conn.execute(
            "INSERT INTO entries (holiday_id, device_id, score, camera_label, image, image_hash, created_at) "
            "VALUES (?,?,?,?,?,?,?)",
            (holiday_id, device_id, score, camera_label[:80], jpg, image_hash, now.isoformat(timespec="seconds")),
        )
        entry_id = cur.lastrowid

    return {"entry_id": entry_id, "thumb": url, "score": score, "entries_count": count + 1}


@router.post("/vote")
async def vote(device_id: str = Form(...), holiday_id: str = Form(...), entry_ids: str = Form("[]")):
    _init_db()
    device_id = _validate_device(device_id)
    now = _now()
    w = _cycle(now, holiday_id)
    if not w:
        raise HTTPException(status_code=404, detail="Unknown holiday challenge.")
    phase = _phase(w, now)
    if phase != "voting":
        if phase == "submitting":
            raise HTTPException(status_code=409, detail="Voting opens when the challenge window closes.")
        if phase == "results":
            raise HTTPException(status_code=409, detail="Voting has ended — results are in.")
        raise HTTPException(status_code=409, detail="This challenge hasn't started yet.")

    try:
        ids = [int(x) for x in json.loads(entry_ids)]
    except Exception:
        raise HTTPException(status_code=400, detail="entry_ids must be a JSON list of entry ids.")
    ids = list(dict.fromkeys(ids))[:MAX_VOTES]
    if len(ids) > MAX_VOTES:
        raise HTTPException(status_code=400, detail=f"Pick at most {MAX_VOTES} favorites.")

    with _LOCK, _connect() as conn:
        valid = {
            r["id"]: r["device_id"]
            for r in conn.execute(
                "SELECT id, device_id FROM entries WHERE holiday_id = ?", (holiday_id,)
            ).fetchall()
        }
        for eid in ids:
            if eid not in valid:
                raise HTTPException(status_code=400, detail="One of those entries is not in this challenge.")
            if valid[eid] == device_id:
                raise HTTPException(status_code=400, detail="You can't vote for your own photo.")
        conn.execute(
            "DELETE FROM votes WHERE device_id = ? AND entry_id IN "
            "(SELECT id FROM entries WHERE holiday_id = ?)",
            (device_id, holiday_id),
        )
        for eid in ids:
            conn.execute(
                "INSERT INTO votes (entry_id, device_id, created_at) VALUES (?,?,?)",
                (eid, device_id, now.isoformat(timespec="seconds")),
            )
    return {"voted": ids}


@router.post("/entry/delete")
async def delete_entry(device_id: str = Form(...), entry_id: int = Form(...)):
    _init_db()
    device_id = _validate_device(device_id)
    now = _now()
    with _LOCK, _connect() as conn:
        row = conn.execute("SELECT * FROM entries WHERE id = ?", (entry_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Entry not found.")
        if row["device_id"] != device_id:
            raise HTTPException(status_code=403, detail="That entry belongs to another device.")
        w = _cycle(now, row["holiday_id"])
        if w and _phase(w, now) != "submitting":
            raise HTTPException(status_code=409, detail="Entries can only be removed while submissions are open.")
        conn.execute("DELETE FROM votes WHERE entry_id = ?", (entry_id,))
        conn.execute("DELETE FROM entries WHERE id = ?", (entry_id,))
    return {"deleted": entry_id}
