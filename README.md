# AI Photography Instructor

An interactive teaching app for new photographers. Upload a photo, get structured AI-coach
feedback (score, issues, technical/composition notes, fixes), then **learn camera settings by
changing them**: a camera-accurate toolbar simulates what ISO / shutter / aperture / white
balance / picture style would have done to that photo — with the coach explaining every change.

> The preview is an explicit **simulation/approximation** for teaching, not a physically
> accurate render. Every screen labels it as such.

## Quick start (one command)

```bash
./start.sh
```

This installs dependencies on first run (uv + npm), then starts:
- Frontend (Vite + React + TS): `http://localhost:$APP_PORT` (default 3001)
- Backend (FastAPI): `http://localhost:$APP_PORT+100` (default 3112 … bound to APP_PORT+100)

Open the printed **UI** URL, drop a JPG/PNG, pick a camera, hit **Analyze with Photo Coach**.

### Requirements
- Python 3.11+ with [uv](https://docs.astral.sh/uv/) (`uv sync` runs automatically)
- Node 18+ (npm install runs automatically)

### Manual setup (if you prefer)

```bash
uv sync                        # backend deps (fastapi, pillow, numpy, pydantic, openai)
cd frontend && npm install     # frontend deps (react, zustand, vite, vitest)
./start.sh                     # or: uv run uvicorn backend.main:app --port 3122 &
                               #     cd frontend && npm run dev -- --port 3001
```

## Environment variables

Copy `.env.example` to `.env` and adjust:

| Variable | Default | Purpose |
|---|---|---|
| `PHOTO_COACH_PROVIDER` | `auto` | `auto` (AI engine if key present, else heuristic) · `mock` · `openai` · `gemini` |
| `OPENAI_API_KEY` / `GEMINI_API_KEY` | — | AI engine keys (or use the in-app Setup page, which wins) |
| `OPENAI_MODEL` | `gpt-4o-mini` | Vision model for the OpenAI engine |
| `MAX_UPLOAD_MB` | `20` | Upload size guard (larger uploads get a friendly 413) |

**MVP runs fully offline**: the default engine is a deterministic heuristic coach that
computes real image statistics (exposure level, highlight/shadow clipping, color cast, noise,
sharpness, rule-of-thirds luminance balance) with numpy and turns them into structured
feedback. No API key, no cost, same input → same output. Add a key via the Setup page (or
env) and an AI vision engine takes over automatically (with automatic fallback to the
deterministic engine on any failure).

## How to add a camera model (JSON only — no code changes)

Edit **`data/camera_models.json`** and append an object to `cameras`:

```json
{
  "id": "fuji_xt5",
  "brand": "Fujifilm",
  "model": "X-T5",
  "description": "Mid-range mirrorless · APS-C",
  "layout": {
    "groups": [
      { "id": "exposure", "label": "Exposure", "settings": ["iso", "aperture", "shutter_speed", "exposure_comp"] },
      { "id": "color",    "label": "Color",    "settings": ["white_balance", "picture_style"] },
      { "id": "focus",    "label": "Focus & Metering", "settings": ["focus_mode", "metering_mode"] }
    ]
  },
  "defaults": { "iso": "160", "shutter_speed": "1/125", "aperture": "f/4.0", "...": "..." },
  "settings": {
    "iso": {
      "type": "discrete", "label": "ISO", "default": "160",
      "usable_max": "6400", "usable_note": "grain above 6400",
      "beginner": "Sensor sensitivity…",
      "options": [ { "value": "160", "label": "160" }, { "value": "320", "label": "320" } ]
    },
    "exposure_comp": { "type": "range", "label": "Exp. comp", "min": -5, "max": 5, "step": 0.333333, "default": 0 },
    "white_balance": { "type": "discrete", "label": "White balance", "default": "auto",
      "options": [ { "value": "auto", "label": "AWB" }, { "value": "kelvin", "label": "C.Temp" } ],
      "kelvin": { "min": 2500, "max": 10000, "step": 100, "default": 5500 } }
  }
}
```

Notes:
- The UI builds the toolbar from `layout.groups` + `settings`; any setting **absent** from
  `settings` simply doesn't render for that camera (e.g. the Rebel SL3 has no Kelvin WB).
- Recognized setting ids (used by the simulator): `iso`, `aperture`, `shutter_speed`,
  `exposure_comp`, `white_balance`, `picture_style`, `focus_mode`, `metering_mode`.
  Unknown ids render as controls but don't affect the preview.
- Optional per-setting keys: `usable_max` / `usable_note` (⚠️ warning styling), `beginner`
  (tooltip text), `kelvin` (sub-range for WB).
- The backend reads the same file for validating/normalizing AI recommendations, so the JSON
  is the single source of truth for both ends.

Ships with three entry-level cameras that demonstrate capability differences:
Canon EOS Rebel SL3 (±2 EV, no Kelvin WB, Picture Styles), Sony A6400 (±5 EV, Creative Looks,
C.Temp 2500–9900K, ISO to 102400), Nikon Z50 (±5 EV, Picture Controls incl. Flat, ISO to 51200).

## Photography-style knowledge base (`data/shooting_styles.json`)

The teaching layer: six styles — Portrait, Landscape, Sports/Action, Night & Celestial,
Wedding, Child/Baby — each a JSON object with:

| Key | What it drives |
|---|---|
| `recipe.settings` + `recipe.why` | Recommended starting settings; "⚡ Use recipe" applies them to the simulator (snapped to the selected camera's stops, undoable) |
| `priorities` | Weighting of the heuristic coach's diagnostics (e.g. Sports weights sharpness 1.6×, Night weights noise 1.3×, Wedding weights color cast 1.5×) |
| `rules` | Deterministic nudges on recommendations: `shutter_floor` (Sports ≥1/500, Kids ≥1/320), `aperture_target` (Portrait f/2, Landscape f/8), `iso_max` (Night ≤1600), `allow_slow_shutter` (Night) |
| `watch_fors` | Style-typical failure modes shown in the coach panel |
| `exercises` | Style-specific drills, shown first (generic drills fill the rest) |

Adding a style = appending a JSON object, no code changes. The selector appears on the
upload screen and in the workspace header; the choice persists and is sent with every
analysis (`style_id`), and the OpenAI provider receives it as context for scene-aware critique.

## Upgrading to AI critique — the Setup page

The app is fully functional offline with the deterministic engine (measured image stats +
this style knowledge base). When you're ready for scene-aware AI critique and free-form chat:

1. Click **⚙ Coach engine setup** (upload screen) or **⚙ Setup** (workspace header).
2. Pick an engine — **OpenAI vision** or **Google Gemini vision** — paste your API key, and
   optionally set a model name or API base URL (proxies / compatible endpoints).
3. Save. The engine activates immediately, no restart. The coach panel's badge flips from
   "Heuristic (offline)" to the AI engine's name.

The key is stored in `runtime_settings.json` (gitignored) on the machine running the backend
and is only ever sent to the provider you chose; the API returns it masked. If the AI engine
fails, is missing a key, or returns invalid output, the app silently falls back to the
deterministic coach and chat — with a visible notice. `GEMINI_API_KEY` / `OPENAI_API_KEY`
env vars work as fallbacks for headless setups.

## Interactive learning features

- **Camera body viewer** — tab next to the preview. Six illustrated views (top, back, front,
  both sides, bottom) per camera with clickable hotspots mapped to toolbar controls; pins
  flash when you change the corresponding setting. Hotspots live in each camera's `body`
  block in `camera_models.json` (coordinates use a 400×260 space per view).
- **Live histogram** — luminance histogram overlay on the preview that moves as you change
  settings, with red/blue edge markers for blown highlights / crushed blacks.
- **Focus point** — a draggable ⊹ marker on the preview; the depth-of-field blur falls away
  from wherever you put it.
- **Guided lessons (🎓)** — the coach drives your simulator step by step: "Fix this photo"
  (from the analysis), "Style recipe walkthrough" (from the selected style), and "Exposure
  triangle, hands on". Each step applies a setting, narrates the effect, and highlights the
  toolbar control; **Revert** restores your pre-lesson settings. Built deterministically from
  the JSON knowledge bases — an AI engine will later personalize these, same player.
- **Coach chat (💬)** — ask questions ("why is my photo grainy?", "what aperture for blurry
  backgrounds?"). Answers come from the built-in knowledge base with your current camera,
  settings and style as context; with an AI engine configured, chat becomes fully
  photo-aware (the current image is attached automatically).

## Architecture notes

```
data/camera_models.json      # camera source of truth (frontend import + backend read)
data/shooting_styles.json    # photography-style knowledge base (recipes, weights, rules, drills)
backend/
  main.py                    # FastAPI: /api/health /api/cameras /api/exif /api/analyze /api/chat /api/settings, static prod serving
  config.py                  # env-driven settings
  runtime_config.py          # Setup-page persistence (provider/key/model/base URL, masked reads)
  styles.py                  # style catalog loader
  exif.py                    # per-tag fault-tolerant EXIF extraction
  image_utils.py             # decode, EXIF-orient, downscale, JPEG+base64
  cache.py                   # thread-safe LRU+TTL cache
  coach/
    schema.py                # strict pydantic response schema (validated for every provider)
    mock.py                  # deterministic heuristic coach + knowledge-base chat replies
    openai_provider.py       # OpenAI vision engine (analyze + chat)
    gemini_provider.py       # Gemini vision engine via REST (analyze + chat)
    prompt.py                # instructor system prompts + JSON contract
frontend/ (React 18 + TS + Vite)
  src/lib/camera.ts          # catalog helpers, shutter/aperture parsing, EV math, snapping
  src/lib/styles.ts          # style catalog helpers
  src/lib/lessons.ts         # guided-lesson builder (fix-tour / recipe / triangle)
  src/lib/simulation.ts      # settings → SimParams → canvas transforms (+ histogram)
  src/lib/tips.ts            # deterministic per-change coach explanations
  src/state/store.ts         # zustand store + localStorage persistence
  src/components/            # UploadScreen, Workspace, ImageViewer, CameraToolbar, CoachPanel,
                             #   SettingsScreen, camera_body/ (illustrated 6-view body)
tests/                       # pytest (backend)   frontend/tests/ → vitest
```

### State management
`zustand` store holds screen, file/dataUrl, EXIF, selected camera + per-camera settings,
analysis result, session log, and an undo snapshot. Camera choice, per-camera settings,
beginner mode and intent persist to `localStorage` (`photo-coach-session`). The uploaded
image intentionally stays in memory (too big for localStorage; IndexedDB is the natural
next step).

### Image pipeline (simulation)
1. Upload → decoded once into a preview-sized source canvas (long edge ≤ 1280 px).
2. **Settings → SimParams** (`settingsToSimParams`), relative to the *as-shot baseline*
   (EXIF ISO/shutter/aperture if present, else the camera JSON defaults):
   - exposure gain `= log₂((t/t₀)·(ISO/ISO₀)·(N₀/N)²) + EV_comp` → `brightness()` filter
   - shutter < 1/60 s → horizontal motion smear (repeated offset draws)
   - ISO above baseline → grain (fixed-seed noise so the pattern doesn't "boil")
   - aperture wider than baseline → radial-masked gaussian blur (depth of field)
   - WB presets → temperature/tint channel shifts; Kelvin slider maps 2500–10000 K
   - Picture Style/Creative Look/Picture Control → contrast, saturation, B&W, unsharp amount
3. **Render** (`renderPreview`): motion smear → GPU filter pass (brightness/contrast/saturate)
   → single pixel pass (WB shift, unsharp, grain, mono) → DoF composite. Debounced at 120 ms.

### AI request/response schema

`POST /api/analyze` (multipart):
`file` (JPG/PNG), `camera_id`, `settings` (JSON object of current toolbar values),
`intent` (free text from the upload screen).

```jsonc
// 200 OK — CoachResponse
{
  "provider": "mock",            // "mock" | "openai"
  "cached": false,               // true when image hash + camera + settings + intent seen before
  "notice": null,                // fallback notice when the real provider failed
  "chat_response": "…",          // short human reply for the coach panel
  "analysis": {
    "overall_score": 72,         // 0–100
    "summary": "…",
    "issues": [ { "id": "blown_highlights", "title": "Blown highlights", "severity": "high", "explanation": "…" } ],
    "technical_notes": { "exposure": "…", "white_balance": "…", "noise": "…", "sharpness": "…" },
    "composition_notes": [ "…" ],
    "suggested_fixes": { "in_camera": ["…"], "in_post": ["…"] },
    "recommended_settings": { "iso": "400", "shutter_speed": "1/250", "aperture": "f/2.8",
                              "white_balance": "cloudy", "exposure_comp": 0, "reasoning": "…" },
    "practice_exercises": [ { "title": "…", "goal": "…", "how": "…" } ]  // exactly 3
  }
}
```

Guardrails: uploads capped (`413` friendly message), corrupt files rejected (`400`), images
downscaled to ≤1024 px before analysis, strict pydantic validation of model output, one retry
for the OpenAI provider, then silent fallback to the mock with a visible notice. Cost control:
downscaling + LRU/TTL cache keyed by image hash + camera + settings + intent.

## Known limitations (deliberate MVP cuts)

- Preview is an approximation: highlights can't be truly "un-blown", noise is synthetic,
  composition notes are luminance heuristics (no scene understanding without a vision model).
- No free-text chat with the coach yet (the upload-screen intent field + session log cover
  the feedback loop); mock provider can't hold a dialogue.
- Recommendations assume "one subject, stills, handheld".
- RAW files not supported (JPG/PNG only).

## Test plan

Automated:
```bash
uv run pytest            # 48 backend tests: schema, determinism, clamping, styles, API, cache, guardrails, engines, chat
cd frontend && npx vitest run   # 27 frontend tests: parsing, EV math, sim mapping, snapping, styles, lessons
```

Manual smoke test (~5 min):
1. `./start.sh` → open the UI URL. Upload screen shows drag-and-drop; upload a JPG with EXIF
   → camera/ISO/shutter/aperture/focal length appear; a PNG without EXIF shows the fallback note.
2. Pick a **style chip** (e.g. 🏃 Sports/Action) → the recipe card appears; pick **Sony A6400**
   → toolbar shows C.Temp + Creative Looks + AF-A/DMF. Switch to **Canon Rebel SL3**
   → Kelvin option disappears, EV range becomes ±2, labels change.
3. Click **Analyze** → coach panel shows the style recipe card, score ring, issues with
   severity chips, technical notes, fixes, recommended settings, 3 exercises (style drills first).
4. **Simulator**: raise ISO → brighter + grainier (⚠️ past usable_max); slow shutter to 1"
   → motion smear; open aperture to widest → background blur; WB Tungsten → cools the image;
   Monochrome → B&W. Each change adds a coach tip line to the session log; **Why?** expands it.
   Toggle **Original** to compare, **Reset** to restore defaults.
5. Click **⚡ Use recipe** (style card) or **⚡ Apply to simulator** (recommendations card)
   → toolbar jumps to those settings → **↩ Undo** returns to your previous settings.
6. Toggle **Beginner/Pro** → per-control tooltips appear/disappear. The **Coach engine**
   badge shows Heuristic (offline) — it flips to OpenAI vision when a key is configured.
7. Reload the page → last camera, style, settings and beginner mode are restored (localStorage).
8. Upload a >20 MB file (or corrupt file) → friendly error, no crash. Repeat the same
   analysis twice → second response reports `cached: true` (visible in devtools network tab).
