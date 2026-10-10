# AI Photography Instructor — project conventions

## Stack
- Frontend: React 18 + TypeScript + Vite (frontend/), zustand for state, no UI library (custom CSS in src/styles.css, dark Apple-inspired theme).
- Backend: FastAPI (backend/), managed by uv at repo root (pyproject.toml, .venv). Python 3.11+. fastapi pinned >=0.115,<0.116 (starlette 1.7/httpx2 TestClient deadlocks in this sandbox — do not unpin).
- Single source of truth: data/camera_models.json (cameras + "body" hotspot blocks for 6 SVG views); data/shooting_styles.json (6 styles); data/training_courses.json (classes: 2 free teasers + paid); data/app_config.json (store_url + stub redemption_codes NIGHT2026/PORTRAIT-PRO). Frontend imports directly (vite fs.allow covers ../); backend reads for validation + coach. Adding a camera/style/class = JSON edit only.
- Run via ./start.sh (APP_PORT frontend, APP_PORT+100 backend, vite proxies /api). Devguard block required. Backend has no --reload: restart start.sh after backend changes.
- Tests: pytest at repo root (pythonpath=["."], tests/conftest.py isolates runtime_settings.json per-test — never hit real AI APIs from tests), vitest in frontend/tests/. Mock coach + chat replies deterministic.

## Engine/provider architecture (LIVE: user's Gemini key configured)
- backend/coach: mock.py (deterministic numpy heuristics + keyword chat), openai_provider.py, gemini_provider.py (REST, header auth x-goog-api-key — key must NEVER go in URLs, httpx logs them). All validate analyze against pydantic schema; chat is plain text.
- Gemini specifics: model default "gemini-flash-lite-latest" (self-updating alias; 0.9s; the full "gemini-flash-latest" alias routes to a thinking model that times out at 90s — treat both "gemini-2.0-flash" and "gemini-flash-latest" as legacy in _resolved()). maxOutputTokens 8192 (2048 truncates the JSON). _extract_json strips fences + slices outermost braces. _generate retries 5xx twice (free-tier 503s). httpx logger pinned to WARNING in main.py.
- Engine resolution: runtime_config (Setup page, runtime_settings.json gitignored, key masked in API) > env (GEMINI_API_KEY/OPENAI_API_KEY/PHOTO_COACH_PROVIDER). Failures fall back to mock with visible notice; /api/settings POST rebinds without restart (RLock).
- User plan: free-tier Gemini key IS configured and verified working (analysis 3.2s, scene-aware critique, valid camera values).

## Interactive features
- Camera body viewer: image-pane tab, 6 views, hotspots in camera JSON body.blocks (400x260 space/view); hotspot click → setHighlight(setting) pulses toolbar; setting change → hotspot flash (store.lastChangedSetting).
- ImageViewer: live luminance histogram, draggable focus dot (drag measured against viewerRef rect — NOT the dot element; dot dims when aperture >= baseline).
- Lessons (lib/lessons.ts): fix-tour / style-recipe / exposure-triangle; LessonPlayer applies steps + highlight, beginUndoable/undoApply revert.
- Coach chat: /api/chat (multipart, optional image) → provider.chat; mock = keyword router; gemini = real photo-aware replies. store.askCoach.
- Classes (ClassesScreen): library grid, embedded mp4/YouTube/Vimeo player, "Load in simulator" → store.practicePreset auto-loads frontend/public/demo/sample.jpg if no photo in session (demo picsum seed photocoach1, 76KB), redemption code unlock persisted.
- Style KB drives: recipe card, weighted score penalties, deterministic recommendation rules, style drills first.

## Key design decisions
- Simulation baseline = EXIF (iso/shutter/aperture) else camera defaults; gain = log2((t/t0)(ISO/ISO0)(N0/N)^2)+EV. DoF only when opening wider than baseline. Motion smear below 1/60s. WB presets/kelvin → temp/tint shifts. Picture styles → contrast/saturation/sharpen/mono.
- Coach tips for setting changes are deterministic text (lib/tips.ts), NOT AI calls. Cache: LRU+TTL keyed by sha256(image)+camera+settings+style+intent.
- Persist via zustand partialize: cameraId, settingsByCamera, beginner, intent, styleId, unlockedCourses. Image/chat/highlight/focus not persisted.
- ErrorBoundary wraps every screen (recoverable card instead of blank app).
- Backend serves frontend/dist as SPA if it exists. Accepted cuts: no free-form AI chat without key, JPG/PNG only, composition notes are luminance heuristics, DoF mask is radial.

## GitHub
- repo https://github.com/PirateAK/AI-Photography-Instructor (private), fine-grained token GITHUB_TOKEN ("WorkshopAI") — has Contents RW; still needs Workflows: Read+write to push .github/workflows/ci.yml (parked on local branch ci-pending; ship via git cherry-pick ci-pending + push when granted).