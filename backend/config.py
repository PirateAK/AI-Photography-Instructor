import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CAMERAS_JSON = ROOT / "data" / "camera_models.json"

# Provider selection: auto | mock | openai
PROVIDER = os.getenv("PHOTO_COACH_PROVIDER", "auto").strip().lower()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip()

MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "20"))
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

# Images are downscaled before analysis (cost control / speed)
ANALYSIS_MAX_DIM = 1024
