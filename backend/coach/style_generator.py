"""AI-drafted photography style entries for the Style Manager.

Uses whichever AI engine is active (Setup page). The draft is RETURNED, never
saved — the user reviews and edits it in the Style Manager before saving.
"""
from __future__ import annotations

import json
import re

from . import provider_for_request

SYSTEM_PROMPT = """You are a photography curriculum designer building entries for a
beginner photography teaching app. Output a single valid JSON object and nothing else.

The entry teaches a photography STYLE/GENRE. Fill it with accurate, practical knowledge:
recommended starting settings that actually make sense for the genre, what typically goes
wrong, and drills a beginner can do with any entry-level camera."""

SCHEMA_INSTRUCTIONS = """{
  "id": "<lowercase snake_case slug, 3-40 chars, e.g. 'macro'>",
  "label": "<Human name, e.g. 'Macro'>",
  "emoji": "<one emoji>",
  "description": "<1-2 sentences: who/what this style is for>",
  "level": "<Beginner|Intermediate|Advanced>",
  "recipe": {
    "summary": "<one sentence starting-point strategy>",
    "settings": {
      "aperture": "<f-number like 'f/2.8'>",
      "shutter_speed": "<like '1/250' or '8\\\"'>",
      "iso": "<number as string like '400'>",
      "exposure_comp": <number EV or 0>
    },
    "why": "<3-4 sentences explaining WHY these starting settings work>"
  },
  "priorities": {
    "<one or more of: highlights, shadows, exposure, color_cast, noise, sharpness>": <weight 0.1-3.0>
  },
  "rules": {
    "shutter_floor": "<'1/500'-style minimum speed if motion matters, else null>",
    "aperture_target": "<'f/2.8'-style target if a look matters, else null>",
    "iso_max": "<number cap if noise matters, else null>",
    "allow_slow_shutter": <true only if tripod work is expected>
  },
  "watch_fors": ["<3 typical beginner failure modes in this genre>"],
  "exercises": [
    {"title": "<short>", "goal": "<one sentence>", "how": "<2-3 sentences of concrete steps>"},
    {"title": "<short>", "goal": "<>", "how": "<>"},
    {"title": "<short>", "goal": "<>", "how": "<>"}
  ]
}

Rules: exactly 3 exercises; every value must be concrete (real f-numbers, real shutter
speeds); priorities only from the listed keys; output the JSON object only."""


def draft_style(name: str) -> dict:
    """Ask the active AI engine for a style draft. Raises ValueError when no AI engine."""
    provider, kind = provider_for_request()
    if kind == "mock" or provider.name == "mock":
        raise ValueError(
            "No AI engine connected — add a key on the Setup page to draft styles with AI."
        )
    user_prompt = f"Design the photography style entry for: {name.strip()}\n\n{SCHEMA_INSTRUCTIONS}"
    raw = provider.generate_json(SYSTEM_PROMPT, user_prompt, max_tokens=4000)
    return _parse(raw)


LESSON_SYSTEM_PROMPT = """You are a photography instructor designing interactive guided lessons
for a beginner photography teaching app with a LIVE CAMERA SIMULATOR. Output a single valid JSON
object and nothing else.

Each lesson is a short sequence of steps. Each step sets ONE camera setting on the simulator; the
app applies it and the student watches the photo respond. Narrations teach WHY, in plain practical
language: identify the subject first, pick the one priority dial that matters most, then blend the
others around it. Every value must be a real camera value the simulator can apply."""

LESSON_SCHEMA_INSTRUCTIONS = """{
  "lessons": [
    {
      "id": "<short slug ending in -1/-2/-3>",
      "title": "<short and specific, e.g. 'Freeze the bird, then pay for it'>",
      "description": "<1-2 sentences: what the student will feel or learn>",
      "steps": [
        {
          "settingId": "<one of: iso | aperture | shutter_speed | white_balance | exposure_comp | picture_style | focus_mode | metering_mode>",
          "value": "<real camera value: '400', 'f/2.8', '1/500', 'auto', or a number for exposure_comp EV>",
          "narration": "<1-2 sentences: what to watch change in the photo and why it happens>",
          "why": "<optional one-line principle behind the move>"
        }
      ],
      "practice_brief": "<a hands-on drill to try in the simulator, 1-2 sentences>"
    }
  ]
}

Rules: 2-3 lessons; 2-4 steps per lesson; steps should build on each other (priority dial first,
blending second); output the JSON object only."""


def draft_style_lessons(style: dict) -> dict:
    """Ask the active AI engine for guided lessons for an existing style. ValueError when no AI engine."""
    provider, kind = provider_for_request()
    if kind == "mock" or provider.name == "mock":
        raise ValueError(
            "No AI engine connected — add a key on the Setup page to generate lessons with AI."
        )
    context = json.dumps(
        {
            "label": style.get("label"),
            "description": style.get("description"),
            "recipe": style.get("recipe"),
            "watch_fors": style.get("watch_fors"),
        },
        ensure_ascii=False,
    )
    user_prompt = (
        f"Design interactive guided lessons for this photography style:\n{context}\n\n"
        f"{LESSON_SCHEMA_INSTRUCTIONS}"
    )
    raw = provider.generate_json(LESSON_SYSTEM_PROMPT, user_prompt, max_tokens=4000)
    return _parse_lessons(raw)


def _parse_lessons(raw: str) -> dict:
    from .gemini_provider import _extract_json

    data = _extract_json(raw)
    if isinstance(data, dict) and isinstance(data.get("lessons"), list):
        return data
    if isinstance(data, dict) and isinstance(data.get("style_lessons"), dict):
        return data["style_lessons"]
    return {"lessons": []}


def _parse(raw: str) -> dict:
    from .gemini_provider import _extract_json

    data = _extract_json(raw)
    if isinstance(data, dict) and "style" in data and isinstance(data["style"], dict):
        data = data["style"]
    if isinstance(data, dict):
        slug = re.sub(r"[^a-z0-9_]+", "_", str(data.get("id", data.get("label", "custom"))).lower()).strip("_")
        data["id"] = slug[:40] if len(slug) >= 3 else "custom_" + slug
    return data
