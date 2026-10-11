"""Optional OpenAI vision provider.

Activated automatically when OPENAI_API_KEY is present (PHOTO_COACH_PROVIDER=auto)
or configured from the in-app Setup page. On any failure (network, invalid
JSON, schema violation after one retry) the caller falls back to the mock coach.
"""
from __future__ import annotations

import json
import logging

from openai import OpenAI

from .prompt import CHAT_SYSTEM_PROMPT, SYSTEM_PROMPT
from .schema import AnalysisResult

log = logging.getLogger(__name__)


class OpenAIProvider:
    name = "openai"

    def __init__(self, api_key: str, model: str, base_url: str | None = None):
        self.client = OpenAI(api_key=api_key, base_url=base_url or None)
        self.model = model

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

        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": json.dumps(payload, ensure_ascii=False)},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
                ],
            },
        ]

        last_error: Exception | None = None
        for attempt in range(2):  # one retry on schema/parse failure
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                response_format={"type": "json_object"},
                temperature=0.4,
                max_tokens=1800,
            )
            raw = response.choices[0].message.content or "{}"
            try:
                parsed = json.loads(raw)
                analysis = AnalysisResult.model_validate(parsed["analysis"])
                chat = str(parsed.get("chat_response") or analysis.summary)
                return analysis, chat, None
            except Exception as exc:  # invalid JSON or schema mismatch
                last_error = exc
                log.warning("OpenAI coach returned invalid output (attempt %d): %s", attempt + 1, exc)
                messages = messages[:2] + [
                    messages[1],
                    {"role": "assistant", "content": raw[:2000]},
                    {"role": "user", "content": (
                        "Your previous reply failed validation: "
                        f"{last_error}. Return the corrected single JSON object only."
                    )},
                ]

        raise RuntimeError(f"OpenAI coach failed after retry: {last_error}")

    def generate_json(self, system: str, user_prompt: str, max_tokens: int = 4000) -> str:
        """Free-form structured JSON generation (used by the Style Manager)."""
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.5,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content or ""

    def chat(self, message: str, history: list[dict], context: dict, image_b64: str | None = None) -> str:
        messages: list[dict] = [{"role": "system", "content": CHAT_SYSTEM_PROMPT}]
        for turn in history[-12:]:
            role = "assistant" if turn.get("role") == "assistant" else "user"
            messages.append({"role": role, "content": str(turn.get("text", ""))[:2000]})
        content: list[dict] | str
        if image_b64:
            content = [
                {"type": "text", "text": f"Context: {json.dumps(context, ensure_ascii=False)}\n\nUser: {message}"},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}},
            ]
        else:
            content = f"Context: {json.dumps(context, ensure_ascii=False)}\n\nUser: {message}"
        messages.append({"role": "user", "content": content})
        response = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=0.6,
            max_tokens=900,
        )
        return response.choices[0].message.content or ""
