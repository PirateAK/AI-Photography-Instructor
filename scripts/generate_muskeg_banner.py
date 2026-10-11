"""Generates the Muskegman.com banner background image (build-time asset).

Run: uv run scripts/generate_muskeg_banner.py
Saves to frontend/public/images/muskegman-banner.jpg
"""
import os
from google import genai
from google.genai import types

client = genai.Client(
    api_key=os.environ.get("GEMINI_WORKSHOP_API_KEY"),
    http_options={
        "api_version": "v1alpha",
        "base_url": os.environ.get("GEMINI_WORKSHOP_BASE_URL"),
    },
)

PROMPT = (
    "A wide panoramic photograph of an Alaskan muskeg wetland at dawn: misty tundra pools reflecting "
    "golden light, black spruce trees silhouetted on the horizon, moody low clouds breaking with warm "
    "light, muted earthy greens and golds, cinematic depth, tranquil and vast, no people, no animals in "
    "focus, no text, no logos, landscape orientation, wide banner composition"
)


def main() -> None:
    response = client.models.generate_content(
        model="gemini-3.1-flash-image",
        contents=PROMPT,
        config=types.GenerateContentConfig(response_modalities=["IMAGE"]),
    )
    for part in response.parts:
        if part.inline_data is not None:
            image = part.as_image()
            out = "frontend/public/images"
            os.makedirs(out, exist_ok=True)
            image.save(f"{out}/muskegman-banner.png")
            print(f"Saved: {out}/muskegman-banner.png")
            return
    raise RuntimeError("No image generated")


if __name__ == "__main__":
    main()
