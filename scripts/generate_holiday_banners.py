"""Generates the 8 seasonal holiday banners (build-time assets).

Run: uv run scripts/generate_holiday_banners.py
Saves 1600x560 JPEGs to frontend/public/images/banners/<id>.jpg
Skips files that already exist — delete one to regenerate it.
"""
import os

from PIL import Image
from google import genai
from google.genai import types

client = genai.Client(
    api_key=os.environ.get("GEMINI_WORKSHOP_API_KEY"),
    http_options={
        "api_version": "v1alpha",
        "base_url": os.environ.get("GEMINI_WORKSHOP_BASE_URL"),
    },
)

OUT = "frontend/public/images/banners"
TARGET = (1600, 560)  # matches the Muskegman banner aspect

STYLE = (
    "Wide cinematic photograph, dark moody atmosphere matching a professional dark-themed "
    "photography app, rich color, shallow depth of field, no people's faces, no text, no logos, "
    "no watermarks, wide banner composition with the subject slightly right of center and dark "
    "space on the left for overlay text"
)

PROMPTS = {
    "halloween": (
        "A glowing jack-o'-lantern on a weathered porch railing at dusk, warm candle flame "
        "flickering inside, purple-blue twilight bokeh, drifting mist, autumn leaves"
    ),
    "thanksgiving": (
        "A rustic wooden Thanksgiving table with a golden roast, candles and autumn gourds, "
        "soft window light from the side, deep amber and brown tones, steam rising"
    ),
    "christmas": (
        "A Christmas tree at night with warm glowing lights melting into golden bokeh orbs, "
        "dark living room, wrapped presents catching the glow, deep green and gold"
    ),
    "new_year": (
        "Sparkler light-trails spelling a swirl over a dark city skyline, distant fireworks "
        "blooming as soft red and gold bokeh, midnight blue night"
    ),
    "valentines": (
        "A bouquet of deep red roses on a dark table beside a single flickering candle, "
        "warm candlelight, soft red bokeh in the background, romantic and moody"
    ),
    "easter": (
        "Pastel-colored Easter eggs in a woven basket among fresh spring blossoms, soft early "
        "morning light with dew, gentle pastel pinks and greens, dark background"
    ),
    "mothers_day": (
        "A bouquet of soft pink peonies in a ceramic vase on a windowsill, gentle window light, "
        "dark moody interior, tender and calm mood"
    ),
    "july4th": (
        "A large firework burst reflecting over calm lake water at night, red white and blue "
        "sparks, silhouetted treeline, long-exposure feel"
    ),
}


def generate_one(holiday_id: str, prompt: str) -> None:
    dest = os.path.join(OUT, f"{holiday_id}.jpg")
    if os.path.exists(dest):
        print(f"skip {holiday_id} (exists)")
        return
    response = client.models.generate_content(
        model="gemini-3.1-flash-image",
        contents=f"{prompt}. {STYLE}",
        config=types.GenerateContentConfig(response_modalities=["IMAGE"]),
    )
    for part in response.parts:
        if part.inline_data is not None:
            img = part.as_image()
            tmp = os.path.join(OUT, f"{holiday_id}.png")
            img.save(tmp)  # genai wrapper save; Pillow takes over from here
            # center-crop to the banner aspect, then resize
            pil = Image.open(tmp).convert("RGB")
            tw, th = TARGET
            aspect = tw / th
            w, h = pil.size
            if w / h > aspect:
                nw = int(h * aspect)
                pil = pil.crop(((w - nw) // 2, 0, (w + nw) // 2, h))
            else:
                nh = int(w / aspect)
                pil = pil.crop((0, (h - nh) // 2, w, (h + nh) // 2))
            pil = pil.resize(TARGET, Image.LANCZOS)
            pil.save(dest, "JPEG", quality=82, optimize=True, progressive=True)
            os.remove(tmp)
            kb = os.path.getsize(dest) // 1024
            print(f"saved {dest} ({kb} KB)")
            return
    raise RuntimeError(f"No image generated for {holiday_id}")


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for holiday_id, prompt in PROMPTS.items():
        generate_one(holiday_id, prompt)


if __name__ == "__main__":
    main()
