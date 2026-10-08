# AI Photography Instructor — project conventions

## Stack
- Frontend: React 18 + TypeScript + Vite (frontend/), zustand for state, no UI library (custom CSS in src/styles.css, dark Apple-inspired theme).
- Backend: FastAPI (backend/), managed by uv at repo root (pyproject.toml, .venv). Python 3.11+. fastapi pinned >=0.115,<0.116 (starlette 1.7/httpx2 TestClient deadlocks in this sandbox — do not unpin).
- Single source of truth: data/camera_models.json (cameras + "body" hotspot blocks for 6 SVG views); data/shooting_styles.json (6 styles: recipes, priorities, rules, drills). Frontend imports both directly (vite fs.allow covers ../); backend reads for validation + coach behavior. Adding a camera or style = JSON edit only.
- Run via ./start.sh (APP_PORT frontend, APP_PORT+100 backend, vite proxies /api). Devguard block required. Backend has no --reload: restart start.sh after backend changes.
- Tests: pytest at repo root (pythonpath=["."]), vitest in frontend/tests/. Mock coach + chat replies must stay deterministic.

## Engine/provider architecture
- backend/coach: mock.py (deterministic numpy heuristics + keyword chat), openai_provider.py, gemini_provider.py (REST, no SDK). All validate analyze output against pydantic schema; chat is plain text.
- Engine resolution: runtime_config (Setup page, runtime_settings.json gitignored, key masked in API) > env (GEMINI_API_KEY/OPENAI_API_KEY/PHOTO_COACH_PROVIDER). Provider failures fall back to mock with visible notice; /api/settings POST rebinds engine without restart (RLock — save() calls load()).
- User plan: no key for now; later adds a Gemini (or other) key via the in-app ⚙ Setup page.

## Interactive features
- Camera body viewer: image-pane tab, 6 views, hotspots in camera JSON body.blocks (400x260 space/view); hotspot click → setHighlight(setting) pulses toolbar control; setting change → hotspot flash (store.lastChangedSetting).
- ImageViewer: live luminance histogram (computeHistogram, toggle), draggable focus dot (store.focusPoint) feeding renderPreview DoF mask.
- Lessons (lib/lessons.ts): fix-tour / style-recipe / exposure-triangle; LessonPlayer applies steps via updateSetting + highlight, beginUndoable/undoApply revert. Steps frozen at lesson open (useMemo on cam/exif/style/analysis).
- Coach chat: /api/chat (multipart, optional image) → provider.chat; mock = build_chat_reply keyword router with context. store.askCoach.
- Style KB drives: recipe card (⚡ Use recipe → snapToCamera), weighted score penalties, deterministic recommendation rules (shutter_floor seconds-comparison: slower = larger), style drills first.

## Key design decisions
- Simulation baseline = EXIF (iso/shutter/aperture) else camera defaults; gain = log2((t/t0)(ISO/ISO0)(N0/N)^2)+EV. DoF only when opening wider than baseline. Motion smear below 1/60s. WB presets/kelvin → temp/tint shifts. Picture styles → contrast/saturation/sharpen/mono.
- Coach tips for setting changes are deterministic text (lib/tips.ts), NOT AI calls. Cache: LRU+TTL keyed by sha256(image)+camera+settings+style+intent.
- Persist via zustand partialize: cameraId, settingsByCamera, beginner, intent, styleId. Image/chat/highlight/focus not persisted.
- Backend serves frontend/dist as SPA if it exists. Accepted MVP cuts: no free-form AI chat without key, JPG/PNG only, composition notes are luminance heuristics, DoF mask is radial.