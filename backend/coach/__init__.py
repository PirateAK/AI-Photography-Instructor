"""Provider selection + chat entry points.

Engine resolution order (in-app Setup page wins over env):
  runtime_settings.json -> env (PHOTO_COACH_PROVIDER / OPENAI_API_KEY / GEMINI_API_KEY)
Engines: mock (deterministic, always available), openai, gemini. Any AI-engine
failure falls back to the mock with a visible notice.
"""
from __future__ import annotations

import logging
import os

from .. import config, runtime_config
from .mock import MockCoach

log = logging.getLogger(__name__)

_ENGINES = ("mock", "openai", "gemini")


class FallbackCoach:
    """Wraps the mock coach with a fixed notice (used when an AI engine fails)."""

    name = "mock"

    def __init__(self, notice: str):
        self._notice = notice
        self._mock = MockCoach()

    def analyze(self, image, camera, settings, intent, exif, style=None):
        analysis, chat, _ = self._mock.analyze(image, camera, settings, intent, exif, style)
        return analysis, chat, self._notice

    def chat(self, message, history, context, image_b64=None):
        return self._mock.chat(message, history, context, image_b64)


def _resolved() -> dict:
    """Merge env fallbacks with runtime (Setup page) settings."""
    cfg = runtime_config.load()
    provider = (cfg.get("provider") or config.PROVIDER or "auto").lower()
    api_key = cfg.get("api_key") or os.getenv("GEMINI_API_KEY", "") or config.OPENAI_API_KEY
    model = cfg.get("model")
    if not model:
        model = "gemini-2.0-flash" if provider == "gemini" else config.OPENAI_MODEL
    base_url = cfg.get("base_url") or None
    return {"provider": provider, "api_key": api_key, "model": model, "base_url": base_url}


def _build_engine(kind: str, api_key: str, model: str, base_url: str | None):
    if kind == "openai":
        from .openai_provider import OpenAIProvider

        return OpenAIProvider(api_key, model, base_url)
    if kind == "gemini":
        from .gemini_provider import GeminiProvider

        return GeminiProvider(api_key, model, base_url)
    raise ValueError(f"Unknown engine: {kind}")


def provider_for_request():
    """Return (provider, engine_kind). Never raises.

    - mock            -> deterministic heuristic coach
    - openai / gemini -> AI vision engine, falling back to mock with a notice
    - auto            -> openai if OPENAI_API_KEY set, else gemini if GEMINI_API_KEY
                         set, else silent mock
    """
    r = _resolved()
    kind, key, model, base_url = r["provider"], r["api_key"], r["model"], r["base_url"]

    if kind == "mock":
        return MockCoach(), "mock"

    if kind in ("openai", "gemini"):
        if not key:
            return FallbackCoach(
                f"No API key for the {kind} engine — add one on the Setup page or switch back "
                "to the heuristic coach."
            ), kind
        try:
            return _build_engine(kind, key, model, base_url), kind
        except Exception as exc:
            log.warning("%s provider unavailable (%s); using mock.", kind, exc)
            return FallbackCoach("AI engine unavailable — showing deterministic heuristic feedback."), kind

    # auto
    if config.OPENAI_API_KEY:
        try:
            return _build_engine("openai", config.OPENAI_API_KEY, config.OPENAI_MODEL, None), "openai"
        except Exception as exc:
            log.warning("OpenAI provider unavailable (%s); using mock.", exc)
    if os.getenv("GEMINI_API_KEY", ""):
        try:
            return _build_engine("gemini", os.getenv("GEMINI_API_KEY", ""), "gemini-2.0-flash", None), "gemini"
        except Exception as exc:
            log.warning("Gemini provider unavailable (%s); using mock.", exc)
    return MockCoach(), "mock"


def available_engines() -> list[str]:
    return list(_ENGINES)
