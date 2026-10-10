# AI Photography Instructor — project conventions

## Stack
- Frontend: React 18 + TypeScript + Vite (frontend/), zustand for state, no UI library (custom CSS in src/styles.css, dark Apple-inspired theme).
- Backend: FastAPI (backend/), managed by uv at repo root (pyproject.toml, .venv). Python 3.11+. fastapi pinned >=0.115,<0.116 (starlette 1.7/httpx2 TestClient deadlocks in this sandbox — do not unpin).
- Single source of truth: data/camera_models.json (31 cameras incl. body hotspots; body types: dslr/mirrorless/vlog — vlog = no viewfinder: ZV-E10 II + Z30); data/shooting_styles.json (10 genres — editable via Style Manager UI + /api/styles); data/training_courses.json (12 courses / 46 lessons in 4 categories: Fundamentals, Genre-specific, Advanced, Specialized — 3 free teasers; editable via Course Manager UI + /api/courses); data/lenses.json (34 lenses across EF/RF/E/Z — lens swap sim); data/app_config.json (store_url + stub redemption_codes NIGHT2026/PORTRAIT-PRO). Frontend imports directly (vite fs.allow covers ../); styles + courses also load from GET /api/styles + /api/courses on app start to pick up live edits. Adding a camera/lens/style/class = JSON edit or in-app UI.
- Run via ./start.sh (APP_PORT frontend, APP_PORT+100 backend, vite proxies /api). Devguard block required. Backend has no --reload: restart start.sh after backend changes.
- Tests: pytest at repo root (pythonpath=["."], tests/conftest.py isolates runtime_settings.json AND photo-history DB per-test; styles/courses admin tests re-point their data paths to tmp copies — never hit real AI APIs, never touch real data files), vitest in frontend/tests/. Mock coach + chat replies deterministic. CI: GitHub Actions .github/workflows/ci.yml runs pytest + tsc + vitest on push/PR — LIVE, green on every push.

## Engine/provider architecture (LIVE: user's Gemini key configured)
- backend/coach: mock.py (deterministic numpy heuristics + keyword chat), openai_provider.py, gemini_provider.py (REST, header auth x-goog-api-key — key must NEVER go in URLs, httpx logger pinned WARNING in main.py). All validate analyze against pydantic schema; chat is plain text. Both AI providers expose generate_json() (used by style + course drafting).
- Gemini specifics: model default "gemini-flash-lite-latest" (self-updating alias; 0.9s; "gemini-flash-latest" routes to a thinking model that times out — treat "gemini-2.0-flash" and "gemini-flash-latest" as legacy in _resolved()). maxOutputTokens 8192 (2048 truncates the JSON). _extract_json strips fences + slices outermost braces. _generate retries 5xx twice (free-tier 503s).
- Engine resolution: runtime_config (Setup page, runtime_settings.json gitignored, key masked in API) > env. Failures fall back to mock with visible notice; /api/settings POST rebinds without restart (RLock).
- User plan: free-tier Gemini key configured and verified. NOTE: key appeared in chat screenshots + one log line — user declined rotation (solo/ship use); fine.

## Interactive features
- Camera body viewer: image-pane tab, 6 views, hotspots in camera JSON body.blocks; hotspot click → toolbar highlight; setting change → hotspot flash.
- ImageViewer: live histogram, draggable focus dot (measured against viewerRef rect; dims when aperture >= baseline). Upload → toolbar initializes from EXIF as-shot (snapToCamera); Reset returns to as-shot.
- Lens swap sim (data/lenses.json + lib/lenses.ts): lens selector in toolbar filtered by mount (mountOf derives EF/RF/E/Z from body line — Canon R-series regex); lens replaces camera's aperture options; focal-zoom framing vs EXIF focal (clamp 1-4x; wider clamps to 1 honestly); IS raises shake threshold 4 stops; setLens clamps impossible apertures + logs tip. lensByCamera persisted.
- Lessons: difficulty chips (lesson.difficulty ?? course.level) + in-course filter; completion ✓ circles + "Mark complete" (store.completedLessons persisted); course cards show progress bars; Progress screen has curriculum section (courseProgress).
- Coach chat, guided lessons (LessonPlayer), Style Manager (AI drafting via provider.generate_json), Course Manager (CourseManagerScreen: CRUD + AI course draft + contributor template download + author credit; backend/courses_admin.py validates and backs up).
- Progress: per-device photo history (backend/history.py SQLite at data/photo_history.db gitignored) — auto-save after every successful analyze; same device+image_hash UPDATES row; GET list with 320px thumbnails; DELETE scoped to device; deviceId = crypto.randomUUID persisted.
- Style KB drives: recipe card, weighted score penalties, deterministic recommendation rules, style drills first. Stale persisted styleId resets on reload. Course catalog reload also resets stale styleId.

## Key design decisions
- Simulation baseline = EXIF (iso/shutter/aperture/focal) else camera defaults; gain = log2((t/t0)(ISO/ISO0)(N0/N)^2)+EV. DoF only when opening wider than baseline. Motion smear below 1/60s (raised by IS). WB presets/kelvin → temp/tint shifts. Picture styles → contrast/saturation/sharpen/mono.
- Coach tips for setting changes are deterministic text (lib/tips.ts), NOT AI calls. Cache: LRU+TTL keyed by sha256(image)+camera+settings+style+intent.
- Apply-to-simulator no-op detection: logs "already match your setup" instead of silently doing nothing.
- Persist via zustand partialize: cameraId, settingsByCamera, beginner, intent, styleId, unlockedCourses, deviceId, lensByCamera, completedLessons. Image/chat/highlight/focus not persisted.
- ErrorBoundary wraps every screen. Backend serves frontend/dist as SPA if it exists. Accepted cuts: composition notes are luminance heuristics, DoF mask is radial, history is per-device (no accounts), variable-aperture zooms simulated at their wide-end range.

## GitHub
- repo https://github.com/PirateAK/AI-Photography-Instructor (private), token GITHUB_TOKEN ("WorkshopAI", fine-grained) — Contents RW + Workflows RW. CI live and green on every push. main = origin/main.

## Status: ALL DEV ITEMS COMPLETE (incl. lens swap sim, photo history, Style/Course Managers). Remaining = user content: record lesson videos (replace MDN friday.mp4 in training_courses.json), real store_url in app_config.json, publish app. Future ideas parked: website camera/course packs, compact-camera mode, contributor accounts/moderation, quizzes, share cards. Camera/lens specs are teaching-accurate approximations.