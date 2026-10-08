"""Runtime engine settings (the in-app "Setup" page persistence).

Stores provider choice, API key, model and optional base URL in a local JSON
file (gitignored). Keys stay on the user's machine; the API only ever returns
a masked key.
"""
from __future__ import annotations

import json
import threading

from .config import ROOT

_LOCK = threading.RLock()  # reentrant: save() calls load() while holding the lock
PATH = ROOT / "runtime_settings.json"
FIELDS = ("provider", "api_key", "model", "base_url")
_DEFAULTS: dict[str, str] = {k: "" for k in FIELDS}


def load() -> dict[str, str]:
    with _LOCK:
        if PATH.exists():
            try:
                data = json.loads(PATH.read_text(encoding="utf-8"))
                return {**_DEFAULTS, **{k: str(data.get(k, "")) for k in FIELDS}}
            except Exception:
                return dict(_DEFAULTS)
        return dict(_DEFAULTS)


def save(update: dict) -> dict[str, str]:
    with _LOCK:
        cfg = load()
        for field in FIELDS:
            if field in update and update[field] is not None:
                cfg[field] = str(update[field]).strip()
        PATH.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
        return cfg


def masked(cfg: dict[str, str]) -> dict[str, str]:
    key = cfg.get("api_key") or ""
    shown = f"{key[:3]}…{key[-4:]}" if len(key) > 8 else ("•••" if key else "")
    return {**cfg, "api_key": shown}


def clear_key() -> dict[str, str]:
    return save({"api_key": ""})
