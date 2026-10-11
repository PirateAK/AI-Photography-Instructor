"""AI Photography Instructor — FastAPI backend.

Endpoints:
  GET  /api/health    -> status + active provider
  GET  /api/cameras   -> camera_models.json (single source of truth)
  POST /api/exif      -> extract EXIF from an uploaded image
  POST /api/analyze   -> Photo Coach analysis (mock or OpenAI) with caching

Serving: in dev, Vite proxies /api here. If frontend/dist exists (production
build), this app also serves the built frontend as static files.
"""
from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .cache import MemoryCache, make_key
from .coach import available_engines, provider_for_request
from .coach.schema import CoachResponse
from .config import ANALYSIS_MAX_DIM, CAMERAS_JSON, MAX_UPLOAD_BYTES
from .exif import extract_exif
from .history import router as history_router
from .image_utils import downscale, encode_jpeg_b64, load_image, mean_luminance
from .runtime_config import clear_key, load as load_runtime, masked, save as save_runtime
from .styles import get_style
from .styles_admin import router as styles_admin_router
from .courses_admin import router as courses_admin_router

logging.basicConfig(level=logging.INFO)
logging.getLogger("httpx").setLevel(logging.WARNING)  # httpx logs full request URLs — keep them quiet
log = logging.getLogger(__name__)

app = FastAPI(title="AI Photography Instructor", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- site access gate (published deployments) --------------------------------
# When data/app_config.json defines site_access_code, every non-GET /api call
# must present it (cookie "site_access" or X-Access-Code header). Only
# /api/access/verify is exempt. Tests disable the gate via GATE["disabled"].
APP_CONFIG_PATH = Path(__file__).resolve().parent.parent / "data" / "app_config.json"
GATE = {"disabled": False}
_cached_access_code: str | None = None
_access_code_loaded = False


def _access_code() -> str | None:
    global _cached_access_code, _access_code_loaded
    if GATE["disabled"]:
        return None
    if not _access_code_loaded:
        try:
            cfg = json.loads(APP_CONFIG_PATH.read_text(encoding="utf-8"))
            _cached_access_code = str(cfg.get("site_access_code") or "") or None
        except Exception:
            _cached_access_code = None
        _access_code_loaded = True
    return _cached_access_code


@app.middleware("http")
async def access_gate_middleware(request, call_next):
    path = request.url.path
    method = request.method
    gated = path.startswith("/api") and (
        method not in ("GET", "OPTIONS", "HEAD") or path == "/api/settings"
    )
    if gated and path != "/api/access/verify":
        code = _access_code()
        if code:
            provided = request.cookies.get("site_access") or request.headers.get("x-access-code", "")
            if provided != code:
                return JSONResponse(status_code=401, content={"detail": "Access code required."})
    return await call_next(request)


@app.post("/api/access/verify")
def verify_access(payload: dict):
    """Validate a site access code and set the browser cookie that carries it."""
    code = _access_code()
    provided = str(payload.get("code", "")).strip()
    if not code or provided.upper() != code.upper():
        raise HTTPException(status_code=401, detail="Incorrect access code.")
    response = JSONResponse(content={"ok": True})
    response.set_cookie("site_access", code, max_age=60 * 60 * 24 * 365, samesite="lax")
    return response

cache = MemoryCache(maxsize=128, ttl=3600)


def load_cameras() -> dict:
    return json.loads(CAMERAS_JSON.read_text(encoding="utf-8"))


def _camera_or_404(camera_id: str) -> dict:
    cameras = {c["id"]: c for c in load_cameras()["cameras"]}
    camera = cameras.get(camera_id)
    if not camera:
        raise HTTPException(status_code=400, detail=f"Unknown camera_id '{camera_id}'.")
    return camera


async def _read_upload(file: UploadFile) -> bytes:
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Image is larger than {MAX_UPLOAD_BYTES // (1024 * 1024)} MB. "
                   "Please upload a smaller JPG or PNG.",
        )
    if not data:
        raise HTTPException(status_code=400, detail="Empty upload — please choose an image.")
    return data


@app.get("/api/health")
def health():
    provider, kind = provider_for_request()
    return {"status": "ok", "provider": provider.name, "engine": kind, "engines": available_engines()}


@app.get("/api/settings")
def get_engine_settings():
    """Setup-page state — API key is returned masked, never in full."""
    cfg = load_runtime()
    masked_cfg = masked(cfg)
    _, kind = provider_for_request()
    return {**masked_cfg, "active_engine": kind, "engines": available_engines()}


@app.post("/api/settings")
def set_engine_settings(payload: dict):
    """Save Setup-page values. Omit api_key to keep the stored one."""
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object.")
    unknown = set(payload) - {"provider", "api_key", "model", "base_url", "clear_key"}
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown fields: {sorted(unknown)}")
    if payload.get("provider") and payload["provider"] not in available_engines():
        raise HTTPException(status_code=400, detail=f"Unknown engine '{payload['provider']}'.")
    if payload.get("clear_key"):
        clear_key()
        payload = {k: v for k, v in payload.items() if k != "api_key"}
    cfg = save_runtime(payload)
    _, kind = provider_for_request()
    return {**masked(cfg), "active_engine": kind, "engines": available_engines()}


@app.get("/api/cameras")
def cameras():
    return JSONResponse(content=load_cameras())


@app.post("/api/exif")
async def exif_endpoint(file: UploadFile = File(...)):
    data = await _read_upload(file)
    try:
        img = load_image(data)
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read that file as an image (JPG/PNG expected).")
    info = extract_exif(img)
    info["width"], info["height"] = img.size
    return info


@app.post("/api/analyze", response_model=CoachResponse)
async def analyze(
    file: UploadFile = File(...),
    camera_id: str = Form(...),
    settings: str = Form("{}"),
    intent: str = Form(""),
    style_id: str = Form(""),
):
    data = await _read_upload(file)
    camera = _camera_or_404(camera_id)
    style = get_style(style_id)  # unknown/empty style -> None (graceful)
    try:
        settings_dict = json.loads(settings) if settings else {}
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="'settings' must be valid JSON.")
    if not isinstance(settings_dict, dict):
        raise HTTPException(status_code=400, detail="'settings' must be a JSON object.")

    image_hash = hashlib.sha256(data).hexdigest()
    key = make_key(
        image_hash,
        camera_id,
        json.dumps(settings_dict, sort_keys=True),
        intent.strip().lower(),
        style_id.strip().lower(),
        "v1",
    )
    cached = cache.get(key)
    if cached is not None:
        return CoachResponse(cached=True, **cached)

    try:
        img = load_image(data)
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read that file as an image (JPG/PNG expected).")

    exif = extract_exif(img)
    analysis_img = downscale(img, ANALYSIS_MAX_DIM)

    provider, kind = provider_for_request()
    notice = None
    try:
        analysis, chat, provider_notice = provider.analyze(analysis_img, camera, settings_dict, intent, exif, style)
        notice = provider_notice
    except Exception as exc:
        log.warning("Provider '%s' failed (%s); falling back to mock coach.", provider.name, exc)
        from .coach import FallbackCoach

        notice_text = (
            f"The {kind} engine hiccuped, so here's deterministic heuristic feedback instead."
            if kind != "mock" else "Showing deterministic heuristic feedback."
        )
        provider = FallbackCoach(notice_text)
        kind = "mock"
        analysis, chat, notice = provider.analyze(analysis_img, camera, settings_dict, intent, exif, style)

    # equivalent-exposure guard: neutralize large EV drift in AI recommendations
    from .coach.ev_guard import enforce_equivalent_exposure

    enforce_equivalent_exposure(analysis, exif, camera, mean_luminance(analysis_img))

    payload = {
        "provider": provider.name,
        "engine": kind,
        "analysis": json.loads(analysis.model_dump_json()),
        "chat_response": chat,
        "notice": notice,
    }
    cache.put(key, payload)
    return CoachResponse(cached=False, **payload)


app.include_router(styles_admin_router)
app.include_router(courses_admin_router)
app.include_router(history_router)


@app.post("/api/chat")
async def chat(
    message: str = Form(...),
    history: str = Form("[]"),
    camera_id: str = Form(""),
    settings: str = Form("{}"),
    style_id: str = Form(""),
    image: UploadFile | None = File(None),
):
    """Coach chat. Deterministic knowledge-base replies with the mock engine;
    full photo-aware conversation when an AI engine is configured (Setup page)."""
    if not message.strip():
        raise HTTPException(status_code=400, detail="Message is empty.")
    try:
        history_list = json.loads(history) if history else []
        assert isinstance(history_list, list)
        history_list = [
            {"role": "assistant" if t.get("role") == "assistant" else "user", "text": str(t.get("text", ""))[:2000]}
            for t in history_list
            if isinstance(t, dict)
        ]
    except Exception:
        raise HTTPException(status_code=400, detail="'history' must be a JSON list of {role, text}.")

    try:
        settings_dict = json.loads(settings) if settings else {}
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="'settings' must be valid JSON.")

    camera = _camera_or_404(camera_id) if camera_id else {}
    style = get_style(style_id)
    context = {
        "camera": {k: camera.get(k) for k in ("brand", "model")} if camera else None,
        "settings": settings_dict,
        "style": {"id": style["id"], "label": style["label"], "recipe": style.get("recipe")} if style else None,
    }

    image_b64 = None
    if image is not None:
        data = await image.read()
        if data:
            if len(data) > MAX_UPLOAD_BYTES:
                raise HTTPException(status_code=413, detail="Image too large for chat.")
            try:
                image_b64 = encode_jpeg_b64(load_image(data), quality=80, max_dim=768)
            except Exception:
                image_b64 = None  # chat proceeds without the image

    provider, kind = provider_for_request()
    try:
        reply = provider.chat(message.strip(), history_list, context, image_b64)
    except Exception as exc:
        log.warning("Chat via '%s' failed (%s); using deterministic reply.", provider.name, exc)
        from .coach.mock import build_chat_reply

        reply = build_chat_reply(message.strip(), context)
        return {"reply": reply, "provider": "mock", "notice": "AI engine failed — deterministic reply shown."}
    return {"reply": reply, "provider": kind, "notice": None}


# --- production static serving (after API routes) ---
_dist = CAMERAS_JSON.parent / "frontend" / "dist"
if _dist.exists():
    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="static")
