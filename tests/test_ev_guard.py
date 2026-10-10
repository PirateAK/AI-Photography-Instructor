"""Equivalent-exposure guard tests — AI drift gets neutralized, intentional
repairs on genuinely dark/bright photos stay allowed."""

import json

import pytest

from backend.coach.ev_guard import enforce_equivalent_exposure
from backend.coach.schema import AnalysisResult, RecommendedSettings

CAMERA = json.loads(open("data/camera_models.json").read())["cameras"][0]  # Canon SL3


def make_analysis(iso="400", shutter="1/500", aperture="f/2.8", ev=0.0):
    return AnalysisResult(
        overall_score=70,
        summary="test",
        issues=[],
        technical_notes={"exposure": "", "white_balance": "", "noise": "", "sharpness": ""},
        composition_notes=[],
        suggested_fixes={"in_camera": [], "in_post": []},
        recommended_settings=RecommendedSettings(
            iso=iso,
            shutter_speed=shutter,
            aperture=aperture,
            exposure_comp=ev,
            reasoning="",
        ),
        practice_exercises=[
            {"title": "a", "goal": "g", "how": "h"},
            {"title": "b", "goal": "g", "how": "h"},
            {"title": "c", "goal": "g", "how": "h"},
        ],
    )


def ev_of(rec, baseline={"iso": 100, "shutter": 1 / 125, "aperture": 8.0}):
    from backend.coach.camera_utils import parse_aperture, parse_shutter

    t = parse_shutter(rec.shutter_speed)
    n = parse_aperture(rec.aperture)
    import math

    return math.log2((t / baseline["shutter"]) * (float(rec.iso) / baseline["iso"]) * (baseline["aperture"] / n) ** 2)


def test_three_stop_drift_gets_neutralized():
    exif = {"iso": 100, "shutter_speed": "1/125", "aperture": "f/8.0"}
    analysis = make_analysis(iso="400", shutter="1/500", aperture="f/2.8")  # +3 EV vs that baseline
    enforce_equivalent_exposure(analysis, exif, CAMERA, mean_l=0.45)
    assert abs(ev_of(analysis.recommended_settings)) < 0.6
    assert "Auto-corrected" in analysis.recommended_settings.reasoning


def test_small_drift_is_left_alone():
    analysis = make_analysis(iso="200", shutter="1/250", aperture="f/2.8")  # ~+1 EV
    enforce_equivalent_exposure(analysis, {}, CAMERA, mean_l=0.45)
    assert "Auto-corrected" not in analysis.recommended_settings.reasoning


def test_dark_photo_allows_brightening():
    exif = {"iso": 1600, "shutter_speed": "1/60", "aperture": "f/4.0"}
    analysis = make_analysis(iso="1600", shutter="1/60", aperture="f/2.8")  # ~+1 EV — modest repair
    enforce_equivalent_exposure(analysis, exif, CAMERA, mean_l=0.10)  # very dark scene
    assert abs(ev_of(analysis.recommended_settings, {"iso": 1600, "shutter": 1 / 60, "aperture": 4.0})) < 1.5
    assert "Auto-corrected" not in analysis.recommended_settings.reasoning


def test_exif_baseline_respected():
    exif = {"iso": 1600, "shutter_speed": "1/60", "aperture": "f/4.0"}
    # equivalent exposure to THAT baseline (f/4 1/60 ISO 1600 = f/8 1/15 ISO 1600-ish)
    analysis = make_analysis(iso="1600", shutter="1/15", aperture="f/8.0")
    enforce_equivalent_exposure(analysis, exif, CAMERA, mean_l=0.45)
    assert abs(ev_of(analysis.recommended_settings, {"iso": 1600, "shutter": 1 / 60, "aperture": 4.0})) < 0.6
