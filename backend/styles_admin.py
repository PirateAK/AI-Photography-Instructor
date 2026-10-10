"""Style catalog persistence + validation + AI drafting.

GET  /api/styles          -> current catalog
POST /api/styles          -> upsert or delete a style (validated, written to JSON)
POST /api/styles/generate -> AI-draft a style entry (requires an AI engine)

Writing goes to data/shooting_styles.json — the same single source of truth
the coach and the Classes/Upload UIs read.
"""
from __future__ import annotations

import json
import re
import time
from typing import Any, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .coach.camera_utils import parse_aperture, parse_shutter
from .config import ROOT

router = APIRouter(prefix="/api/styles", tags=["styles"])

STYLES_PATH = ROOT / "data" / "shooting_styles.json"  # tests may re-point this
KNOWN_PRIORITIES = {"highlights", "shadows", "exposure", "color_cast", "noise", "sharpness"}


class StyleRecipeModel(BaseModel):
    summary: str = Field(min_length=5)
    settings: dict[str, Any] = Field(min_length=1)
    why: str = Field(min_length=10)


class StyleExerciseModel(BaseModel):
    title: str = Field(min_length=3)
    goal: str = Field(min_length=5)
    how: str = Field(min_length=10)


class StyleRulesModel(BaseModel):
    shutter_floor: Optional[str] = None
    aperture_target: Optional[str] = None
    iso_max: Optional[float] = None
    allow_slow_shutter: bool = False


class ShootingStyleModel(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9_]{3,40}$")
    label: str = Field(min_length=2, max_length=40)
    emoji: str = Field(min_length=1, max_length=8)
    description: str = Field(min_length=10)
    level: str = "Beginner"
    recipe: StyleRecipeModel
    priorities: dict[str, float] = Field(default_factory=dict)
    rules: StyleRulesModel = Field(default_factory=StyleRulesModel)
    watch_fors: list[str] = Field(default_factory=list)
    exercises: list[StyleExerciseModel] = Field(min_length=2, max_length=4)


class StyleMutation(BaseModel):
    action: Literal["upsert", "delete"]
    style: Optional[ShootingStyleModel] = None
    style_id: Optional[str] = None


def _validate_semantics(style: ShootingStyleModel) -> None:
    """Beyond shape: rule values must parse; priorities must be known keys."""
    rules = style.rules
    if rules.shutter_floor and parse_shutter(rules.shutter_floor) is None:
        raise HTTPException(status_code=400, detail=f"rules.shutter_floor '{rules.shutter_floor}' is not a shutter speed like '1/500'.")
    if rules.aperture_target and parse_aperture(rules.aperture_target) is None:
        raise HTTPException(status_code=400, detail=f"rules.aperture_target '{rules.aperture_target}' is not an aperture like 'f/2.8'.")
    unknown = set(style.priorities) - KNOWN_PRIORITIES
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown priority keys: {sorted(unknown)}. Known: {sorted(KNOWN_PRIORITIES)}.")
    for key, value in style.priorities.items():
        if not 0.1 <= float(value) <= 3.0:
            raise HTTPException(status_code=400, detail=f"priority '{key}' must be between 0.1 and 3.0.")
    for key in ("iso", "aperture", "shutter_speed"):
        if key not in style.recipe.settings:
            raise HTTPException(status_code=400, detail=f"recipe.settings needs at least iso, aperture and shutter_speed (missing '{key}').")
    if parse_shutter(style.recipe.settings.get("shutter_speed")) is None:
        raise HTTPException(status_code=400, detail="recipe.settings.shutter_speed is not a shutter speed.")


def _load_styles() -> list[dict]:
    return json.loads(STYLES_PATH.read_text(encoding="utf-8"))["styles"]


def _write_styles(styles: list[dict]) -> None:
    backup = STYLES_PATH.parent / f".shooting_styles.backup.{int(time.time())}.json"
    payload = {"version": 1, "styles": styles}
    if STYLES_PATH.exists():
        backup.write_text(STYLES_PATH.read_text(encoding="utf-8"), encoding="utf-8")
    STYLES_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


@router.get("")
def get_styles():
    return {"styles": _load_styles()}


@router.post("/generate")
def generate_style(payload: dict):
    name = str(payload.get("name", "")).strip()
    if not name:
        raise HTTPException(status_code=400, detail="Provide a style name, e.g. 'Macro'.")
    from .coach.style_generator import draft_style

    try:
        draft = draft_style(name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI draft failed: {exc}")
    # shape-check but don't block: the reviewer edits the draft, Save validates strictly
    errors: list[str] = []
    try:
        ShootingStyleModel.model_validate(draft)
    except Exception as exc:
        errors = [f"{e.get('loc', '?')}: {e.get('msg', '')}" for e in getattr(exc, "errors", lambda: [])()][:5]
    return {"draft": draft, "validation_errors": errors}


@router.post("")
def mutate_styles(mutation: StyleMutation):
    styles = _load_styles()
    if mutation.action == "delete":
        sid = mutation.style_id
        if not sid:
            raise HTTPException(status_code=400, detail="delete needs style_id.")
        remaining = [s for s in styles if s["id"] != sid]
        if len(remaining) == len(styles):
            raise HTTPException(status_code=404, detail=f"Style '{sid}' not found.")
        if not remaining:
            raise HTTPException(status_code=400, detail="Cannot delete the last remaining style.")
        _write_styles(remaining)
        return {"styles": remaining, "changed": sid}

    # upsert
    style = mutation.style
    if style is None:
        raise HTTPException(status_code=400, detail="upsert needs a style object.")
    _validate_semantics(style)
    entry = json.loads(style.model_dump_json())
    existing = next((s for s in styles if s["id"] == style.id), None)
    if existing:
        styles[styles.index(existing)] = entry
    else:
        if any(s["label"].lower() == style.label.lower() for s in styles):
            raise HTTPException(status_code=400, detail=f"A style labeled '{style.label}' already exists.")
        styles.append(entry)
    _write_styles(styles)
    return {"styles": styles, "changed": style.id}
