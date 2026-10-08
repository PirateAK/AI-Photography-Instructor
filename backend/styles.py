"""Photography-style knowledge base loader (data/shooting_styles.json)."""
from __future__ import annotations

import json

from .config import ROOT

STYLES_JSON = ROOT / "data" / "shooting_styles.json"


def load_styles() -> list[dict]:
    return json.loads(STYLES_JSON.read_text(encoding="utf-8"))["styles"]


def get_style(style_id: str | None) -> dict | None:
    if not style_id:
        return None
    return next((s for s in load_styles() if s["id"] == style_id), None)
