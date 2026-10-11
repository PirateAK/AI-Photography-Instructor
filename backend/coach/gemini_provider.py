"""Optional Gemini (Google AI) vision provider — REST, no SDK required.

Activated from the in-app Setup page (or GEMINI_API_KEY env). On any failure
the caller falls back to the deterministic mock coach.
"""
from __future__ import annotations

import json
import logging
import re
import time

import httpx

from .prompt import CHAT_SYSTEM_PROMPT, SYSTEM_PROMPT
from .schema import AnalysisResult

log = logging.getLogger(__name__)

DEFAULT_ROOT = "https://generativelanguage.googleapis.com/v1beta"
# Self-updating alias for the current fast flash-lite model — quick enough for
# free-tier latency and structured JSON output. Users can override in Setup.
DEFAULT_MODEL = "gemini-flash-lite-latest"


def _extract_json(text: str) -> dict:
    """Parse model output tolerantly: strip fences, keep the outermost object."""
    cleaned = _strip_fences(text)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start, end = cleaned.find("{"), cleaned.rfind("}")
        if start != -1 and end > start:
            return json.loads(cleaned[start:end + 1])
        raise


def _strip_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.S)
    return text.strip()


class GeminiProvider:
    name = "gemini"

    def __init__(self, api_key: str, model: str = DEFAULT_MODEL, base_url: str | None = None):
        self.api_key = api_key
        self.model = model or DEFAULT_MODEL
        self.root = (base_url or DEFAULT_ROOT).rstrip("/")

    def _generate(self, system: str, contents: list[dict], temperature: float, max_tokens: int, json_mode: bool) -> str:
        body = {
            "system_instruction": {"parts": [{"text": system}]},
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
                **({"responseMimeType": "application/json"} if json_mode else {}),
            },
        }
        last_error: Exception | None = None
        for attempt in range(3):  # free tier occasionally 503s — retry transient errors
            try:
                response = httpx.post(
                    f"{self.root}/models/{self.model}:generateContent",
                    headers={"x-goog-api-key": self.api_key},  # header auth: key never appears in URLs/logs
                    json=body,
                    timeout=90,
                )
                response.raise_for_status()
                data = response.json()
                candidates = data.get("candidates") or []
                if not candidates:
                    raise RuntimeError(f"Gemini returned no candidates: {data.get('promptFeedback', data)}")
                parts = candidates[0].get("content", {}).get("parts") or []
                text = "".join(p.get("text", "") for p in parts).strip()
                if not text:
                    raise RuntimeError("Gemini returned an empty response.")
                return text
            except httpx.HTTPStatusError as exc:
                last_error = exc
                if exc.response.status_code >= 500 and attempt < 2:
                    time.sleep(1.5 * (attempt + 1))
                    continue
                raise
        raise last_error  # pragma: no cover

    @staticmethod
    def _context_payload(camera: dict, settings: dict, intent: str, exif: dict, style: dict | None, challenge: dict | None = None) -> dict:
        return {
            "camera": {"brand": camera.get("brand"), "model": camera.get("model")},
            "supported_settings": {
                key: [o["value"] for o in definition.get("options", [])]
                for key, definition in camera.get("settings", {}).items()
            },
            "current_settings": settings,
            "exif": exif,
            "user_intent": intent or "(not provided)",
            "photography_style": (
                {"id": style["id"], "label": style["label"], "recipe": style.get("recipe"),
                 "watch_fors": style.get("watch_fors")}
                if style else "(none selected)"
            ),
            "photo_challenge": (
                {"title": challenge.get("title", ""), "goal": challenge.get("goal", "")}
                if challenge else "(none)"
            ),
        }

    def analyze(self, image, camera: dict, settings: dict, intent: str, exif: dict, style: dict | None = None, challenge: dict | None = None):
        from ..image_utils import encode_jpeg_b64

        b64 = encode_jpeg_b64(image, quality=85, max_dim=1024)
        payload = self._context_payload(camera, settings, intent, exif, style, challenge)
        contents = [
            {
                "role": "user",
                "parts": [
                    {"text": json.dumps(payload, ensure_ascii=False)},
                    {"inline_data": {"mime_type": "image/jpeg", "data": b64}},
                ],
            }
        ]

        last_error: Exception | None = None
        for attempt in range(2):  # one retry on parse/schema failure
            text = self._generate(SYSTEM_PROMPT, contents, temperature=0.4, max_tokens=8192, json_mode=True)
            try:
                parsed = _extract_json(text)
                analysis = AnalysisResult.model_validate(parsed["analysis"])
                chat = str(parsed.get("chat_response") or analysis.summary)
                return analysis, chat, None
            except Exception as exc:
                last_error = exc
                log.warning("Gemini coach returned invalid output (attempt %d): %s", attempt + 1, exc)
                contents = contents + [
                    {"role": "model", "parts": [{"text": text[:2000]}]},
                    {"role": "user", "parts": [{"text": (
                        f"Your previous reply failed validation: {last_error}. "
                        "Return the corrected single JSON object only."
                    )}]},
                ]
        raise RuntimeError(f"Gemini coach failed after retry: {last_error}")

    def generate_json(self, system: str, user_prompt: str, max_tokens: int = 4000) -> str:
        """Free-form structured JSON generation (used by the Style Manager)."""
        contents = [{"role": "user", "parts": [{"text": user_prompt}]}]
        return self._generate(system, contents, temperature=0.5, max_tokens=max_tokens, json_mode=True)

    def chat(self, message: str, history: list[dict], context: dict, image_b64: str | None = None) -> str:
        contents: list[dict] = []
        for turn in history[-12:]:
            role = "model" if turn.get("role") == "assistant" else "user"
            contents.append({"role": role, "parts": [{"text": str(turn.get("text", ""))[:2000]}]})
        parts: list[dict] = []
        if image_b64:
            parts.append({"inline_data": {"mime_type": "image/jpeg", "data": image_b64}})
        parts.append({"text": f"Context: {json.dumps(context, ensure_ascii=False)}\n\nUser: {message}"})
        contents.append({"role": "user", "parts": parts})
        return self._generate(CHAT_SYSTEM_PROMPT, contents, temperature=0.6, max_tokens=900, json_mode=False)
