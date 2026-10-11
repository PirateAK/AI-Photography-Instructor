import json
from pathlib import Path

import pytest
from PIL import Image

from backend.coach.camera_utils import clamp_recommended, parse_aperture, parse_shutter
from backend.coach.mock import MockCoach, compute_stats
from backend.coach.schema import AnalysisResult

ROOT = Path(__file__).resolve().parent.parent


def load_cameras():
    return json.loads((ROOT / "data" / "camera_models.json").read_text())["cameras"]


def solid_image(color, size=(64, 48)):
    return Image.new("RGB", size, color)


@pytest.fixture(params=["canon_eos_rebel_sl3", "sony_a6400", "nikon_z50"])
def camera(request):
    return {c["id"]: c for c in load_cameras()}[request.param]


def analyze(img, camera, settings=None, intent=""):
    return MockCoach().analyze(img, camera, settings or {}, intent, {})


def test_parse_helpers():
    assert parse_shutter("1/250") == pytest.approx(0.004)
    assert parse_shutter('30"') == 30.0
    assert parse_aperture("f/2.8") == pytest.approx(2.8)
    assert parse_aperture("f/16") == 16.0


def test_dark_image_flags_underexposure_and_recommends_light(camera):
    analysis, chat, notice = analyze(solid_image((8, 8, 12)), camera)
    assert notice is None
    assert any(i.id in ("exposure", "crushed_shadows") for i in analysis.issues)
    assert analysis.overall_score < 60
    assert analysis.recommended_settings.aperture  # suggests something concrete
    assert chat


def test_bright_image_flags_blown_highlights(camera):
    analysis, _, _ = analyze(solid_image((252, 250, 248)), camera)
    assert any(i.id == "blown_highlights" for i in analysis.issues)
    assert analysis.technical_notes.exposure


def test_determinism(camera):
    img = solid_image((120, 90, 60))
    a1, c1, _ = analyze(img, camera, {"iso": "400"}, "sunset")
    a2, c2, _ = analyze(img, camera, {"iso": "400"}, "sunset")
    assert a1.model_dump() == a2.model_dump()
    assert c1 == c2


def test_challenge_is_reflected_in_reply(camera):
    img = solid_image((120, 90, 60))
    plain = MockCoach().analyze(img, camera, {}, "", {})[1]
    challenge = {"id": "halloween", "title": "The Halloween Glow Hunt", "goal": "Capture the glow, no flash."}
    with_c = MockCoach().analyze(img, camera, {}, "", {}, None, challenge)[1]
    assert "The Halloween Glow Hunt" in with_c
    assert "Capture the glow, no flash." in with_c
    assert "The Halloween Glow Hunt" not in plain


def test_schema_bounds_and_exercise_count(camera):
    analysis, _, _ = analyze(solid_image((90, 110, 130)), camera)
    assert isinstance(analysis, AnalysisResult)
    assert 0 <= analysis.overall_score <= 100
    assert len(analysis.practice_exercises) == 3
    assert analysis.technical_notes.noise


def test_recommendations_within_camera_options(camera):
    analysis, _, _ = analyze(solid_image((60, 80, 100)), camera, {"iso": "6400"})
    rec = analysis.recommended_settings
    defs = camera["settings"]
    if rec.iso:
        assert rec.iso in [o["value"] for o in defs["iso"]["options"]]
    if rec.shutter_speed:
        assert rec.shutter_speed in [o["value"] for o in defs["shutter_speed"]["options"]]
    if rec.aperture:
        assert rec.aperture in [o["value"] for o in defs["aperture"]["options"]]
    if rec.white_balance:
        assert rec.white_balance in [o["value"] for o in defs["white_balance"]["options"]]
    if rec.exposure_comp is not None:
        ev = defs["exposure_comp"]
        assert ev["min"] <= rec.exposure_comp <= ev["max"]


def test_intent_blur_background_recommends_widest_aperture(camera):
    apertures = [float(parse_aperture(o["value"])) for o in camera["settings"]["aperture"]["options"]]
    widest = f"f/{min(apertures):g}"
    analysis, _, _ = analyze(solid_image((90, 90, 90)), camera, intent="portraits with blurry backgrounds")
    assert parse_aperture(analysis.recommended_settings.aperture) == min(apertures)
    assert widest  # sanity


def test_exposure_gain_matches_triangle():
    from backend.coach.camera_utils import exposure_gain

    baseline = {"iso": 100, "shutter": 1 / 125, "aperture": 4.0}
    # ISO 200 only -> 2x brighter
    assert exposure_gain(baseline, 200, 1 / 125, 4.0) == pytest.approx(2.0)
    # stop down f/4 -> f/8 -> 4x darker
    assert exposure_gain(baseline, 100, 1 / 125, 8.0) == pytest.approx(0.25)
    # shutter 1/60 -> ~2.08x brighter
    assert exposure_gain(baseline, 100, 1 / 60, 4.0) == pytest.approx(125 / 60)


def test_clamp_recommended_snaps_to_options():
    camera = load_cameras()[0]  # Canon SL3: ISO 100..25600, EV ±2, aperture ladder f/1.4..f/22
    clamped = clamp_recommended(
        camera,
        {"iso": "333", "aperture": "f/1.4", "shutter_speed": "1/350", "exposure_comp": 9},
    )
    assert clamped["iso"] in ("3200", "400")  # nearest stops around 333
    assert clamped["exposure_comp"] <= 2
    assert clamped["aperture"] == "f/1.4"  # prime apertures are on the mount ladder — exact match
    assert clamped["shutter_speed"] in ("1/250", "1/500")  # nearest to 1/350


def test_stats_ranges():
    stats = compute_stats(solid_image((128, 128, 128)))
    assert 0 <= stats.mean_l <= 1
    assert 0 <= stats.saturation <= 1
