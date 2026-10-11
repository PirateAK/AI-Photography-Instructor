"""Content moderation — the first gate, before anything else touches an image.

A quick dedicated Gemini vision check (separate from coaching). Enforced at
every entry point: /api/moderate (photo load), /api/analyze (before the coach
sees the photo), and /api/challenge/submit (shared gallery).

Fail-closed when the engine actively flags an image; fail-open on engine
errors (a Gemini outage must never block legitimate photographers). Verdicts
are cached by image hash so re-checking the same photo is free.

Note: moderation runs on the Gemini engine. If only OpenAI is configured the
check is skipped (fail-open) — the coach engine stack is Gemini-first here.
"""
from __future__ import annotations

import hashlib
import logging

from ..image_utils import encode_jpeg_b64, load_image

log = logging.getLogger(__name__)

TERMS_SUMMARY = (
    "Family-friendly only: no nudity or sexual content (including artistic nudity), "
    "no sexualization of minors, no extreme gore or violence, no promotion of illegal activity."
)

BLOCKED_MESSAGE = (
    "This photo violates the app's content terms (adult or illegal content) — "
    "it can't be coached, saved, or shared here."
)

MODERATION_SYSTEM_PROMPT = f"""You are the content moderator for a family-friendly photography education app.
Terms: {TERMS_SUMMARY}
Judge the photograph itself. Edge cases: artistic/classical-figure nudity still violates the terms;
documentary news imagery of non-sexual violence may pass if not gratuitous; medical or breastfeeding
images are NOT violations.
Respond with JSON only, no markdown:
{{"flagged": true/false, "category": "adult"|"illegal"|"other"|"", "reason": "<at most 12 words>"}}"""

_cache: dict[str, dict] = {}  # image sha256 -> verdict (process-local)
_CACHE_LIMIT = 512


def _gemini_engine():
    """The live Gemini engine, or None when moderation can't run."""
    from . import provider_for_request
    from .gemini_provider import GeminiProvider

    provider, kind = provider_for_request()
    if kind != "gemini" or not isinstance(provider, GeminiProvider):
        return None
    return provider


def moderate_image(data: bytes) -> dict:
    """Verdict for raw image bytes: {'flagged', 'category', 'reason', 'moderated'}.

    moderated=False means the check could not run (no Gemini engine / engine
    error) — callers treat that as a pass (fail-open).
    """
    key = hashlib.sha256(data).hexdigest()
    cached = _cache.get(key)
    if cached is not None:
        return dict(cached)

    verdict = {"flagged": False, "category": "", "reason": "", "moderated": False}
    try:
        engine = _gemini_engine()
        if engine is None:
            _remember(key, verdict)
            return dict(verdict)
        img = load_image(data)
        b64 = encode_jpeg_b64(img, quality=80, max_dim=768)
        contents = [
            {
                "role": "user",
                "parts": [
                    {"text": "Moderate this photo against the terms. Reply with the JSON object only."},
                    {"inline_data": {"mime_type": "image/jpeg", "data": b64}},
                ],
            }
        ]
        text = engine._generate(
            MODERATION_SYSTEM_PROMPT, contents, temperature=0.0, max_tokens=256, json_mode=True
        )
        from .gemini_provider import _extract_json

        parsed = _extract_json(text)
        verdict = {
            "flagged": bool(parsed.get("flagged")),
            "category": str(parsed.get("category", ""))[:24],
            "reason": str(parsed.get("reason", ""))[:200],
            "moderated": True,
        }
        if verdict["flagged"]:
            log.warning("Moderation flagged an image (category=%s, reason=%s)", verdict["category"], verdict["reason"])
    except Exception as exc:
        log.warning("Moderation check failed (%s) — failing open.", exc)
        verdict = {"flagged": False, "category": "", "reason": "", "moderated": False}

    _remember(key, verdict)
    return dict(verdict)


def _remember(key: str, verdict: dict) -> None:
    if len(_cache) >= _CACHE_LIMIT:
        _cache.clear()
    _cache[key] = verdict
