"""Equivalent-exposure guard for AI recommendations.

The AI can drift several stops from the as-shot exposure (it optimizes for
intent, not triangle math). The simulator shows the literal result, which
reads as "the app blew out my photo". This guard neutralizes drift: if the
recommended settings are far from the as-shot EV, ISO (then shutter) absorbs
the difference while the aperture keeps the AI's intended look.

Brightness context matters: a clearly dark photo may legitimately need
brighter settings, so the tolerance widens in the matching direction.
"""
from __future__ import annotations

import math

from .camera_utils import parse_aperture, parse_shutter
from .schema import AnalysisResult


def _iso_float(value: str) -> float:
    return float(str(value).replace("(H)", "").strip())


def enforce_equivalent_exposure(
    analysis: AnalysisResult,
    exif: dict,
    camera: dict,
    mean_l: float | None,
) -> None:
    rec = analysis.recommended_settings
    if not (rec.iso and rec.shutter_speed and rec.aperture):
        return

    iso0 = float(exif.get("iso") or 200) if exif.get("iso") else 200.0
    t0 = parse_shutter(exif.get("shutter_speed")) or 1 / 125
    n0 = parse_aperture(exif.get("aperture")) or 4.0
    try:
        iso = _iso_float(rec.iso)
    except ValueError:
        return
    t = parse_shutter(rec.shutter_speed)
    n = parse_aperture(rec.aperture)
    if t is None or n is None or t <= 0 or n <= 0:
        return

    ev = (
        math.log2((t / t0) * (iso / iso0) * (n0 / n) ** 2)
        + float(rec.exposure_comp or 0)
    )

    cap = 2.5
    if mean_l is not None:
        if mean_l < 0.22 and ev > 0:
            cap = 4.0  # clearly dark photo: brightening further is plausibly intentional
        elif mean_l > 0.68 and ev < 0:
            cap = 4.0  # clearly bright photo: darkening further may be intentional
    if abs(ev) <= cap:
        return

    correction = -ev
    iso_opts = sorted(
        _iso_float(o["value"])
        for o in camera.get("settings", {}).get("iso", {}).get("options", [])
    )
    sh_opts = sorted(
        (parse_shutter(o["value"]) or 0.125, o["value"])
        for o in camera.get("settings", {}).get("shutter_speed", {}).get("options", [])
    )
    if not iso_opts or not sh_opts:
        return

    iso_new = iso * 2**correction
    iso_snap = min(iso_opts, key=lambda v: abs(v - iso_new))
    residual = correction - math.log2(iso_snap / iso)

    rec.iso = f"{iso_snap:g}"
    if abs(residual) > 0.25:  # ISO ran out of range — spill into shutter
        t_new = t * 2**residual
        rec.shutter_speed = min(sh_opts, key=lambda p: abs(p[0] - t_new))[1]

    rec.reasoning = (
        f"{rec.reasoning} Auto-corrected for equivalent exposure "
        f"(removed {abs(ev):.1f} EV of drift versus the as-shot settings)."
    ).strip()
