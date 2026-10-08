"""Camera-model helpers shared by providers (parsing + clamping to a model's
supported options). Mirrors the frontend's lib/camera.ts logic.
"""
from __future__ import annotations

import re
from typing import Any


def parse_shutter(value: str | float | int | None) -> float | None:
    """"1/250" -> 0.004, "30\"" -> 30.0, 0.5 -> 0.5."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip().replace('"', "").replace("s", "")
    if not s:
        return None
    try:
        if "/" in s:
            num, den = s.split("/", 1)
            return float(num) / float(den)
        return float(s)
    except (ValueError, ZeroDivisionError):
        return None


def parse_aperture(value: str | float | int | None) -> float | None:
    """"f/2.8" -> 2.8."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    m = re.search(r"([\d.]+)", str(value))
    return float(m.group(1)) if m else None


def _numeric_options(camera: dict, setting: str, parse) -> list[float]:
    values: list[float] = []
    for opt in camera.get("settings", {}).get(setting, {}).get("options", []):
        v = parse(opt.get("value"))
        if v is not None:
            values.append(v)
    return sorted(values)


def nearest_option(options: list[str], target_value: str, parse) -> str | None:
    """Return the option string whose parsed numeric value is closest to target."""
    if not options:
        return None
    t = parse(target_value)
    if t is None:
        return options[0]
    return min(options, key=lambda o: abs((parse(o) or 0) - t))


def clamp_recommended(camera: dict, rec: dict[str, Any]) -> dict[str, Any]:
    """Snap recommended settings to the camera model's supported values."""
    out: dict[str, Any] = {}
    settings_defs = camera.get("settings", {})

    iso_opts = [o["value"] for o in settings_defs.get("iso", {}).get("options", [])]
    ap_opts = [o["value"] for o in settings_defs.get("aperture", {}).get("options", [])]
    sh_opts = [o["value"] for o in settings_defs.get("shutter_speed", {}).get("options", [])]
    wb_opts = [o["value"] for o in settings_defs.get("white_balance", {}).get("options", [])]

    ev_def = settings_defs.get("exposure_comp", {})

    if rec.get("iso") is not None and iso_opts:
        out["iso"] = nearest_option(iso_opts, str(rec["iso"]), lambda v: float(str(v).replace("integer", "")))
    if rec.get("aperture") is not None and ap_opts:
        out["aperture"] = nearest_option(ap_opts, str(rec["aperture"]), parse_aperture)
    if rec.get("shutter_speed") is not None and sh_opts:
        out["shutter_speed"] = nearest_option(sh_opts, str(rec["shutter_speed"]), parse_shutter)
    if rec.get("white_balance") is not None and wb_opts:
        out["white_balance"] = rec["white_balance"] if rec["white_balance"] in wb_opts else wb_opts[0]
    if rec.get("exposure_comp") is not None and ev_def:
        ev = float(rec["exposure_comp"])
        step = float(ev_def.get("step", 1 / 3))
        ev = round(ev / step) * step
        ev = max(float(ev_def.get("min", -5)), min(float(ev_def.get("max", 5)), ev))
        out["exposure_comp"] = round(ev, 3)

    return out


def exposure_gain(baseline: dict, iso: float, shutter: float, aperture: float) -> float:
    """Linear brightness ratio of new settings vs. as-shot baseline.

    brightness ∝ shutter * iso / aperture².
    """
    b_iso = float(baseline.get("iso") or 200)
    b_sh = float(baseline.get("shutter") or 1 / 125)
    b_ap = float(baseline.get("aperture") or 4.0)
    if b_iso <= 0 or b_sh <= 0 or b_ap <= 0:
        return 1.0
    return (shutter / b_sh) * (iso / b_iso) * (b_ap / aperture) ** 2
