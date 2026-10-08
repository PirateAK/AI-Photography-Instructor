# AI Photography Instructor — project conventions

## Stack
- Frontend: React 18 + TypeScript + Vite (frontend/), zustand for state, no UI library (custom CSS in src/styles.css, dark Apple-inspired theme).
- Backend: FastAPI (backend/), managed by uv at repo root (pyproject.toml, .venv). Python 3.11+.
- Single source of truth for cameras: data/camera_models.json; for photography styles: data/shooting_styles.json — frontend imports both directly (vite fs.allow covers ../), backend reads them for validation + coach behavior. Adding a camera or style = JSON edit only.
- Run everything via ./start.sh (APP_PORT frontend, APP_PORT+100 backend, vite proxies /api). Devguard block required in start.sh. Backend has no --reload: restart start.sh after backend changes.
- Tests: pytest at repo root (pythonpath=["."] in pyproject), vitest in frontend/tests/. Backend mock coach must stay deterministic (no randomness; noise seeded via mulberry32 in frontend sim).

## Key design decisions
- Photo Coach provider abstraction: backend/coach/{mock.py, openai_provider.py}; PHOTO_COACH_PROVIDER=auto|mock|openai (default auto → mock without key, silent; openai falls back to mock with notice). Mock computes real numpy stats (exposure, clipping, cast, noise, sharpness, thirds). All providers validate against strict pydantic schema (backend/coach/schema.py).
- Style knowledge layer (user chose "both deterministic + AI-upgradeable"): shooting_styles.json drives recipe cards (⚡ Use recipe → snapToCamera), weighted score penalties (priorities), deterministic recommendation nudges (rules: shutter_floor, aperture_target, iso_max, allow_slow_shutter), style-specific drills first, and OpenAI payload context. shutter_floor semantics: seconds comparison (slower shutter = larger value).
- Simulation baseline = EXIF (iso/shutter/aperture) when present else camera defaults; brightness gain = log2((t/t0)(ISO/ISO0)(N0/N)^2)+EV. DoF only adds blur when opening wider than baseline. Motion smear below 1/60s. WB presets/kelvin → temp/tint channel shifts. Picture styles → contrast/saturation/sharpen/mono map (lib/simulation.ts).
- Coach tips for setting changes are deterministic text (lib/tips.ts), NOT AI calls; AI only does full analysis. Cache: LRU+TTL keyed by image sha256 + camera + settings + style + intent.
- Persist to localStorage via zustand persist partialize: cameraId, settingsByCamera, beginner, intent, styleId. Uploaded image intentionally not persisted.
- Backend serves frontend/dist as static SPA if it exists (production mode). Coach-engine badge in CoachPanel shows mock vs openai.
- Known accepted MVP cuts: no free-text chat, JPG/PNG only, composition notes are luminance heuristics, DoF mask is fixed center.