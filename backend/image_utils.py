"""Image loading / resizing helpers (guardrails for the AI pipeline)."""
from __future__ import annotations

import base64
import io

from PIL import Image, ImageOps


def load_image(data: bytes):
    """Decode bytes to an RGB PIL image, honoring EXIF orientation."""
    img = Image.open(io.BytesIO(data))
    img = ImageOps.exif_transpose(img)
    return img.convert("RGB")


def downscale(img, max_dim: int):
    """Return a copy downscaled so the longest edge is <= max_dim."""
    w, h = img.size
    scale = max_dim / float(max(w, h))
    if scale < 1.0:
        img = img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    return img


def encode_jpeg_b64(img, quality: int = 85, max_dim: int = 1024) -> str:
    """Downscale + JPEG-encode + base64 (for vision model payloads)."""
    small = downscale(img, max_dim)
    buf = io.BytesIO()
    small.save(buf, format="JPEG", quality=quality)
    return base64.b64encode(buf.getvalue()).decode("ascii")
