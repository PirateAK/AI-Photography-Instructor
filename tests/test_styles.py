import json
from pathlib import Path

import pytest
from PIL import Image

from backend.coach.camera_utils import parse_aperture, parse_shutter
from backend.coach.mock import MockCoach
from backend.styles import get_style, load_styles

ROOT = Path(__file__).resolve().parent.parent

EXPECTED_IDS = {
    "portrait", "landscape", "macro", "wildlife", "sports", "astrophotography",
    "street", "fine_art", "event", "architecture",
    "underwater", "food", "concert", "real_estate", "pet", "family",
    "wedding", "automotive", "aerial", "black_and_white", "travel", "product",
    "fashion", "conceptual",
}


def load_cameras():
    return json.loads((ROOT / "data" / "camera_models.json").read_text())["cameras"]


def camera(cid):
    return {c["id"]: c for c in load_cameras()}[cid]


def analyze(img, cam, settings=None, intent="", style=None):
    return MockCoach().analyze(img, cam, settings or {}, intent, {}, style)


def test_style_catalog_complete():
    styles = load_styles()
    assert {s["id"] for s in styles} == EXPECTED_IDS
    for s in styles:
        assert s["recipe"]["settings"]
        assert s["recipe"]["why"]
        assert len(s["exercises"]) >= 2
        assert s["priorities"]


def test_unknown_style_returns_none():
    assert get_style("") is None
    assert get_style("bogus_id") is None


def test_sports_style_enforces_shutter_floor():
    cam = camera("canon_eos_rebel_sl3")
    sports = get_style("sports")
    dark = Image.new("RGB", (64, 48), (10, 10, 12))  # dark scene wants a slow shutter
    _, _, _ = analyze(dark, cam, style=sports)
    analysis, _, _ = analyze(dark, cam, style=sports)
    rec = analysis.recommended_settings
    assert parse_shutter(rec.shutter_speed) <= parse_shutter("1/500")  # faster or equal
    assert "freeze the action" in rec.reasoning


def test_night_style_caps_iso_and_allows_slow_shutter():
    cam = camera("sony_a6400")
    astro = get_style("astrophotography")
    assert astro["rules"]["allow_slow_shutter"] is True
    gray = Image.new("RGB", (64, 48), (45, 45, 55))
    analysis, _, _ = analyze(gray, cam, {"iso": "12800"}, style=astro)
    assert int(analysis.recommended_settings.iso) <= 3200


def test_portrait_style_targets_wide_aperture():
    cam = camera("sony_a6400")  # widest supported: f/3.5
    portrait = get_style("portrait")
    img = Image.new("RGB", (64, 48), (120, 120, 120))
    analysis, _, _ = analyze(img, cam, style=portrait)
    assert parse_aperture(analysis.recommended_settings.aperture) <= 3.5


def test_style_exercises_come_first_and_fill_three():
    cam = camera("nikon_z50")
    portrait = get_style("portrait")
    img = Image.new("RGB", (64, 48), (120, 120, 120))
    analysis, _, _ = analyze(img, cam, style=portrait)
    titles = [e.title for e in analysis.practice_exercises]
    assert len(titles) == 3
    assert "Eye of the needle" in titles


def test_style_weighted_scoring_is_deterministic_and_differs():
    cam = camera("canon_eos_rebel_sl3")
    img = Image.new("RGB", (64, 48), (20, 20, 25))  # dark + cool cast
    a_sports, _, _ = analyze(img, cam, style=get_style("sports"))
    a_sports2, _, _ = analyze(img, cam, style=get_style("sports"))
    a_cast, _, _ = analyze(img, cam, style=get_style("event"))
    assert a_sports.model_dump() == a_sports2.model_dump()  # deterministic
    assert a_sports.overall_score != a_cast.overall_score  # weights actually apply


def test_no_style_still_works():
    cam = camera("canon_eos_rebel_sl3")
    img = Image.new("RGB", (64, 48), (128, 128, 128))
    analysis, chat, notice = analyze(img, cam)
    assert notice is None
    assert "Shooting" not in analysis.summary
    assert chat
