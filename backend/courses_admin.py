"""Course Manager API — CRUD for training courses + AI course drafting.

GET  /api/courses          -> current catalog
POST /api/courses          -> upsert or delete (validated, backup written)
POST /api/courses/generate -> AI-draft a course (requires an AI engine)

Writes go to data/training_courses.json (the single source of truth) with a
timestamped backup. Tests re-point COURSES_PATH to a temp copy.
"""
from __future__ import annotations

import json
import re
import time
from typing import Any, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .config import ROOT
from .coach.camera_utils import parse_aperture, parse_shutter

router = APIRouter(prefix="/api/courses", tags=["courses"])

COURSES_PATH = ROOT / "data" / "training_courses.json"
CATEGORIES = ("Fundamentals", "Genre-specific", "Advanced", "Specialized")
DIFFICULTIES = ("Beginner", "Intermediate", "Advanced")


class LessonModel(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9_-]{2,40}$")
    title: str = Field(min_length=3, max_length=120)
    duration_min: int = Field(ge=1, le=180)
    summary: str = Field(min_length=10)
    video_url: str = Field(min_length=8)
    video_kind: Literal["mp4", "youtube", "vimeo"]
    difficulty: Optional[Literal["Beginner", "Intermediate", "Advanced"]] = None
    practice_preset: Optional[dict[str, Any]] = None
    practice_brief: Optional[str] = None


class CourseModel(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9_-]{3,50}$")
    category: Literal["Fundamentals", "Genre-specific", "Advanced", "Specialized"]
    title: str = Field(min_length=3, max_length=90)
    cover_emoji: str = Field(min_length=1, max_length=8)
    tagline: str = Field(min_length=5, max_length=140)
    description: str = Field(min_length=20)
    level: str = Field(min_length=3, max_length=40)
    author: Optional[str] = None
    price: Literal["free", "paid"]
    lessons: list[LessonModel] = Field(min_length=1, max_length=40)


class CourseMutation(BaseModel):
    action: Literal["upsert", "delete"]
    course: Optional[CourseModel] = None
    course_id: Optional[str] = None


def _validate_semantics(course: CourseModel) -> None:
    ids = [l.id for l in course.lessons]
    if len(ids) != len(set(ids)):
        raise HTTPException(status_code=400, detail="Lesson ids must be unique within a course.")
    for lesson in course.lessons:
        if not lesson.video_url.lower().startswith(("http://", "https://")):
            raise HTTPException(status_code=400, detail=f"Lesson '{lesson.id}': video_url must be a URL.")
        preset = lesson.practice_preset or {}
        if "shutter_speed" in preset and parse_shutter(str(preset["shutter_speed"])) is None:
            raise HTTPException(status_code=400, detail=f"Lesson '{lesson.id}': practice_preset.shutter_speed is not a shutter speed.")
        if "aperture" in preset and parse_aperture(str(preset["aperture"])) is None:
            raise HTTPException(status_code=400, detail=f"Lesson '{lesson.id}': practice_preset.aperture is not an aperture.")


def _load_courses() -> list[dict]:
    return json.loads(COURSES_PATH.read_text(encoding="utf-8"))["courses"]


def _write_courses(courses: list[dict]) -> None:
    backup = COURSES_PATH.parent / f".training_courses.backup.{int(time.time())}.json"
    payload = {"version": 3, "notes": "", "courses": courses}
    if COURSES_PATH.exists():
        backup.write_text(COURSES_PATH.read_text(encoding="utf-8"), encoding="utf-8")
    COURSES_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


@router.get("")
def get_courses():
    return {"courses": _load_courses()}


@router.post("")
def mutate_courses(mutation: CourseMutation):
    courses = _load_courses()
    if mutation.action == "delete":
        cid = mutation.course_id
        if not cid:
            raise HTTPException(status_code=400, detail="delete needs course_id.")
        remaining = [c for c in courses if c["id"] != cid]
        if len(remaining) == len(courses):
            raise HTTPException(status_code=404, detail=f"Course '{cid}' not found.")
        _write_courses(remaining)
        return {"courses": remaining, "changed": cid}

    course = mutation.course
    if course is None:
        raise HTTPException(status_code=400, detail="upsert needs a course object.")
    _validate_semantics(course)
    entry = json.loads(course.model_dump_json())
    existing = next((c for c in courses if c["id"] == course.id), None)
    if existing:
        courses[courses.index(existing)] = entry
    else:
        if any(c["title"].lower() == course.title.lower() for c in courses):
            raise HTTPException(status_code=400, detail=f"A course titled '{course.title}' already exists.")
        courses.append(entry)
    _write_courses(courses)
    return {"courses": courses, "changed": course.id}


@router.post("/generate")
def generate_course(payload: dict):
    topic = str(payload.get("topic", "")).strip()
    if not topic:
        raise HTTPException(status_code=400, detail="Provide a course topic, e.g. 'Landscape photography masterclass'.")
    from .coach import provider_for_request

    provider, kind = provider_for_request()
    if provider.name == "mock":
        raise HTTPException(status_code=400, detail="No AI engine connected — add a key on the Setup page to draft courses with AI.")

    system = (
        "You are a photography curriculum designer. Output a single valid JSON object, no markdown. "
        "Design a video course for beginner-to-intermediate photographers."
    )
    user = (
        f"Design a video course about: {topic}\n"
        "Return exactly this JSON shape:\n"
        '{"id": "<snake_case slug>", "category": "<Fundamentals|Genre-specific|Advanced|Specialized>", '
        '"title": "<>", "cover_emoji": "<one emoji>", "tagline": "<one line>", "description": "<2-3 sentences>", '
        '"level": "<Beginner|Intermediate|Advanced|Beginner -> Advanced>", "price": "paid", '
        '"lessons": [{"id": "<slug>-1", "title": "<>", "duration_min": <6-10>, "summary": "<2-3 sentences>", '
        '"video_url": "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4", '
        '"video_kind": "mp4", "difficulty": "<Beginner|Intermediate|Advanced>", '
        '"practice_preset": {"aperture": "<f/x>", "shutter_speed": "<1/x or x\\">", "iso": "<number>"}, '
        '"practice_brief": "<hands-on drill for the app simulator>"}]}\n'
        "Rules: 3-6 lessons, ids prefixed with the course slug, every practice_preset value must be a real "
        "camera value, output the JSON object only."
    )
    raw = provider.generate_json(system, user, max_tokens=4000)
    from .coach.gemini_provider import _extract_json

    try:
        draft = _extract_json(raw)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI draft was not valid JSON: {exc}")
    if isinstance(draft, dict) and isinstance(draft.get("course"), dict):
        draft = draft["course"]
    draft["price"] = "paid"  # drafts always start as paid; owner can flip
    errors: list[str] = []
    try:
        CourseModel.model_validate(draft)
    except Exception as exc:
        errors = [f"{e.get('loc', '?')}: {e.get('msg', '')}" for e in getattr(exc, "errors", lambda: [])()][:5]
    return {"draft": draft, "validation_errors": errors}
