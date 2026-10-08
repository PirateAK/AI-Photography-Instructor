"""Minimal EXIF extraction for the upload screen and the simulation baseline.

Returns display-ready values (e.g. shutter "1/250", aperture "f/2.8") plus
numeric iso, so the frontend can reuse them for the exposure-triangle baseline.
Every tag is parsed independently — a malformed tag never aborts the rest.
"""
from __future__ import annotations

from typing import Any

EXIF_IFD_POINTER = 0x8769

_MAIN_TAGS = {0x010F: "camera_make", 0x0110: "camera_model"}
_EXIF_TAGS = {
    0x829A: "exposure_time",
    0x829D: "f_number",
    0x8827: "iso",
    0x920A: "focal_length",
    0x9208: "white_balance_mode",
}

_FIELDS = (
    "camera_make",
    "camera_model",
    "iso",
    "shutter_speed",
    "aperture",
    "focal_length",
    "white_balance",
)


def _as_float(value: Any) -> float | None:
    try:
        if hasattr(value, "numerator") and hasattr(value, "denominator"):
            if value.denominator == 0:
                return None
            return float(value.numerator) / float(value.denominator)
        return float(value)
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def _format_shutter(seconds: float | None) -> str | None:
    if not seconds or seconds <= 0:
        return None
    if seconds >= 1:
        return f"{seconds:g}\""
    return f"1/{round(1 / seconds)}"


def _format_aperture(f_number: float | None) -> str | None:
    if not f_number or f_number <= 0:
        return None
    return f"f/{f_number:g}"


def extract_exif(img) -> dict:
    """Best-effort EXIF extraction; never raises."""
    result: dict = {key: None for key in _FIELDS}
    result["has_exif"] = False
    try:
        exif = img.getexif()
        if not exif:
            return result

        for tag, key in _MAIN_TAGS.items():
            try:
                val = exif.get(tag)
                if val is not None and str(val).strip():
                    result[key] = str(val).strip()
            except Exception:
                continue

        ifd = exif.get_ifd(EXIF_IFD_POINTER) if hasattr(exif, "get_ifd") else {}
        for tag, key in _EXIF_TAGS.items():
            try:
                val = ifd.get(tag)
                if val is None:
                    continue
                if key == "exposure_time":
                    result["shutter_speed"] = _format_shutter(_as_float(val))
                elif key == "f_number":
                    result["aperture"] = _format_aperture(_as_float(val))
                elif key == "iso":
                    iso = _as_float(val)
                    result["iso"] = int(iso) if iso and iso > 0 else None
                elif key == "focal_length":
                    mm = _as_float(val)
                    result["focal_length"] = f"{mm:g}mm" if mm else None
                elif key == "white_balance_mode":
                    mode = _as_float(val)
                    result["white_balance"] = "auto" if mode == 0 else "manual" if mode else None
            except Exception:
                continue

        result["has_exif"] = any(result[key] for key in _FIELDS)
        return result
    except Exception:
        result["has_exif"] = any(result[key] for key in _FIELDS)
        return result
