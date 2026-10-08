"""Deterministic heuristic Photo Coach (the default MVP provider).

Computes real image statistics with numpy — exposure level, highlight/shadow
clipping, color cast, noise, sharpness, rule-of-thirds luminance balance —
and turns them into the structured AnalysisResult. No network calls and no
randomness: the same image + inputs always produce the same analysis.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from PIL import Image

from .camera_utils import clamp_recommended, parse_aperture, parse_shutter
from .schema import (
    AnalysisResult,
    Issue,
    PracticeExercise,
    RecommendedSettings,
    SuggestedFixes,
    TechnicalNotes,
)


@dataclass
class Stats:
    mean_l: float = 0.0            # 0..1 average luminance
    clip_hi: float = 0.0           # fraction of pixels >= 0.98
    clip_lo: float = 0.0           # fraction of pixels <= 0.02
    warmth: float = 0.0            # >0 warm/orange cast, <0 cool/blue cast
    tint: float = 0.0              # >0 magenta, <0 green
    saturation: float = 0.0        # 0..1 mean chroma
    sharpness: float = 0.0         # variance of Laplacian (higher = sharper)
    noise: float = 0.0             # high-frequency energy in flat areas
    thirds: list = field(default_factory=list)  # 3x3 mean luminance grid
    center_contrast: float = 0.0   # center brightness minus border brightness
    aspect: float = 1.0


def _to_array(img, max_dim: int = 384) -> np.ndarray:
    im = img
    w, h = im.size
    scale = max_dim / float(max(w, h))
    if scale < 1.0:
        im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.Resampling.BILINEAR)
    return np.asarray(im, dtype=np.float32) / 255.0


def _luma(rgb: np.ndarray) -> np.ndarray:
    return rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722


def _laplacian(gray: np.ndarray) -> np.ndarray:
    padded = np.pad(gray, 1, mode="edge")
    return (
        padded[:-2, 1:-1] + padded[2:, 1:-1] + padded[1:-1, :-2] + padded[1:-1, 2:] - 4 * gray
    )


def compute_stats(img) -> Stats:
    rgb = _to_array(img)
    l = _luma(rgb)
    s = Stats()
    s.mean_l = float(l.mean())
    s.clip_hi = float((l >= 0.98).mean())
    s.clip_lo = float((l <= 0.02).mean())

    r, g, b = rgb[..., 0].mean(), rgb[..., 1].mean(), rgb[..., 2].mean()
    s.warmth = float((r - b) / max(r, b, 1e-6))
    s.tint = float((g - (r + b) / 2) / max(g, 1e-6))

    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    s.saturation = float(np.where(mx > 0.02, (mx - mn) / np.maximum(mx, 1e-6), 0).mean())

    lap = _laplacian(l)
    s.sharpness = float(lap.var())

    # noise: high-frequency energy where the scene is otherwise smooth
    grad = np.abs(np.diff(l, axis=0)).mean() + np.abs(np.diff(l, axis=1)).mean()
    smooth = np.abs(lap) < max(1e-4, grad)
    s.noise = float(np.abs(lap)[smooth].mean()) if smooth.any() else float(np.abs(lap).mean())

    h, w = l.shape
    cells = [
        float(l[i * h // 3:(i + 1) * h // 3, j * w // 3:(j + 1) * w // 3].mean())
        for i in range(3)
        for j in range(3)
    ]
    s.thirds = cells
    center = cells[4]
    border = np.mean([cells[i] for i in range(9) if i != 4])
    s.center_contrast = center - float(border)
    s.aspect = w / float(h)
    return s


# ---------------------------------------------------------------- issues


def _severity(value: float, low: float, med: float) -> str:
    if value >= med:
        return "high"
    if value >= low:
        return "medium"
    return "low"


def build_issues(s: Stats, settings: dict, camera: dict) -> list[Issue]:
    issues: list[Issue] = []

    if s.clip_hi > 0.005:
        issues.append(Issue(
            id="blown_highlights",
            title="Blown highlights",
            severity=_severity(s.clip_hi, 0.01, 0.05),
            explanation=(
                f"About {s.clip_hi * 100:.1f}% of the image is pure white with no detail left. "
                "Once a highlight is clipped, no amount of editing brings the texture back."
            ),
        ))
    if s.clip_lo > 0.05:
        issues.append(Issue(
            id="crushed_shadows",
            title="Crushed shadows",
            severity=_severity(s.clip_lo, 0.10, 0.25),
            explanation=(
                f"About {s.clip_lo * 100:.1f}% of the image is pure black. Shadow detail is easier to "
                "recover than highlights, but heavy clipping still looks muddy."
            ),
        ))

    exposure_pen = abs(s.mean_l - 0.46)
    if exposure_pen > 0.12:
        direction = "underexposed" if s.mean_l < 0.46 else "overexposed"
        issues.append(Issue(
            id="exposure",
            title=f"Photo looks {direction}",
            severity=_severity(exposure_pen, 0.16, 0.26),
            explanation=(
                f"Average brightness is {s.mean_l * 100:.0f}/100. "
                + ("Lift it with a slower shutter, wider aperture, higher ISO, or + exposure compensation."
                   if s.mean_l < 0.46 else
                   "Tame it with a faster shutter, narrower aperture, lower ISO, or − exposure compensation.")
            ),
        ))

    cast_mag = max(abs(s.warmth) * 1.6, abs(s.tint) * 2.2)
    if cast_mag > 0.12:
        cast = (
            "warm/orange" if s.warmth > 0.06 else "cool/blue" if s.warmth < -0.06
            else "green" if s.tint < 0 else "magenta"
        )
        issues.append(Issue(
            id="color_cast",
            title=f"{cast.capitalize()} color cast",
            severity=_severity(cast_mag, 0.18, 0.30),
            explanation=(
                f"The whites lean {cast} — usually the light source (indoor bulbs, shade, fluorescent tubes). "
                "Pick a matching white-balance preset so colors come out neutral."
            ),
        ))

    if s.noise > 0.012:
        iso_now = settings.get("iso")
        extra = f" You're at ISO {iso_now}, which is likely contributing." if iso_now else ""
        issues.append(Issue(
            id="noise",
            title="Visible noise / grain",
            severity=_severity(s.noise, 0.018, 0.028),
            explanation=(
                "There's noticeable grain in flat areas — typically from high ISO or a very dark scene "
                "where the sensor worked hard." + extra
            ),
        ))

    if s.sharpness < 0.0045:
        issues.append(Issue(
            id="soft_focus",
            title="Image looks soft",
            severity=_severity(-s.sharpness, -0.003, -0.0015),
            explanation=(
                "Fine details aren't crisp. Common causes: shutter speed too slow for handheld shooting, "
                "missed focus, or a lens diffraction/quality limit."
            ),
        ))

    if s.saturation < 0.08:
        issues.append(Issue(
            id="flat_color",
            title="Colors look washed out",
            severity="low",
            explanation="Chroma is very low — could be haze, a flat Picture Style, or intentionally muted light.",
        ))

    return issues


def _score(s: Stats, style: dict | None = None) -> int:
    w = (style or {}).get("priorities") or {}

    def wp(key: str, default: float = 1.0) -> float:
        try:
            return float(w.get(key, default))
        except (TypeError, ValueError):
            return default

    score = 100.0
    score -= s.clip_hi * 180 * wp("highlights")
    score -= s.clip_lo * 45 * wp("shadows")
    score -= abs(s.mean_l - 0.46) * 60 * wp("exposure")
    score -= max(abs(s.warmth) - 0.04, 0) * 120 * wp("color_cast")
    score -= max(abs(s.tint) - 0.03, 0) * 120 * wp("color_cast")
    score -= max(s.saturation - 0.62, 0) * 70
    score -= max(0.08 - s.saturation, 0) * 80
    if s.sharpness < 0.002:
        score -= 28 * wp("sharpness")
    elif s.sharpness < 0.0045:
        score -= 14 * wp("sharpness")
    score -= min(22.0, max(s.noise - 0.012, 0) * 900 * wp("noise"))
    return int(max(5, min(98, round(score))))


# ------------------------------------------------------- recommendations


def _snap_shutter(options: list[tuple[str, float]], target: float) -> str:
    return min(options, key=lambda o: abs(o[1] - target))[0]


def build_recommendations(
    s: Stats,
    camera: dict,
    settings: dict,
    exif: dict,
    intent: str,
    style: dict | None = None,
) -> RecommendedSettings:
    defs = camera.get("settings", {})
    iso_opts = [o["value"] for o in defs.get("iso", {}).get("options", [])]
    ap_opts = [o["value"] for o in defs.get("aperture", {}).get("options", [])]
    sh_opts = [o["value"] for o in defs.get("shutter_speed", {}).get("options", [])]
    wb_opts = [o["value"] for o in defs.get("white_balance", {}).get("options", [])]
    sh_pairs = [(v, parse_shutter(v) or 0.125) for v in sh_opts]
    ap_pairs = sorted(((v, parse_aperture(v) or 8.0) for v in ap_opts), key=lambda p: p[1])
    iso_pairs = sorted(((v, int(v)) for v in iso_opts), key=lambda p: p[1])

    iso = int(settings.get("iso") or exif.get("iso") or 200)
    shutter_val = parse_shutter(settings.get("shutter_speed") or exif.get("shutter_speed")) or 1 / 125
    aperture_val = parse_aperture(settings.get("aperture") or exif.get("aperture")) or 4.0
    reasons: list[str] = []

    def snap_shutter(target: float) -> str:
        return _snap_shutter(sh_pairs, target)

    def snap_aperture(target: float) -> str:
        return min(ap_pairs, key=lambda p: abs(p[1] - target))[0]

    shutter = snap_shutter(shutter_val)
    aperture = snap_aperture(aperture_val)

    # 1) exposure repair
    if s.clip_hi > 0.005:
        ev_cut = min(1.5, 0.5 + s.clip_hi * 6)
        shutter_val = shutter_val / (2 ** ev_cut)
        shutter = snap_shutter(shutter_val)
        reasons.append(
            f"Highlights are clipped, so I'd shorten the shutter to {shutter} (or drop exposure comp) to protect them.")
    elif s.mean_l < 0.30:
        aperture_val = ap_pairs[0][1]
        aperture = ap_pairs[0][0]
        shutter_val = max(shutter_val * 4, 1 / 60)
        shutter = snap_shutter(shutter_val)
        reasons.append(
            f"The scene is dark: open the aperture to {aperture} and slow the shutter to about {shutter} "
            "(stay at 1/60 or faster handheld), then raise ISO only as a last resort.")
    elif s.mean_l > 0.72:
        shutter_val = shutter_val / 2
        shutter = snap_shutter(shutter_val)
        reasons.append(f"The photo runs bright, so a shutter around {shutter} would give more headroom.")

    # 2) noise
    if s.noise > 0.012 and iso > 800:
        target_iso = max(100, iso // 4)
        iso = int(_snap_by(iso_pairs, target_iso))
        reasons.append(f"Drop ISO toward {iso} — the grain isn't earning its keep in this light.")

    # 2b) photography-style rules (deterministic nudges from shooting_styles.json)
    style_rules = (style or {}).get("rules") or {}
    style_label = (style or {}).get("label", "This style")
    floor = parse_shutter(style_rules.get("shutter_floor"))
    if floor and shutter_val > floor:  # seconds: slower shutter = larger value
        shutter_val = floor
        shutter = snap_shutter(shutter_val)
        reasons.append(f"{style_label}: freeze the action — keep the shutter at {rules_fmt(style_rules.get('shutter_floor'))} or faster.")
    ap_target = parse_aperture(style_rules.get("aperture_target"))
    if ap_target and aperture_val > ap_target:
        aperture_val = ap_target
        aperture = snap_aperture(aperture_val)
        reasons.append(f"{style_label}: shoot near {rules_fmt(style_rules.get('aperture_target'))} for the look this subject needs.")
    iso_max = style_rules.get("iso_max")
    if iso_max and iso > int(iso_max):
        iso = int(_snap_by(iso_pairs, int(iso_max)))
        reasons.append(f"{style_label}: keep ISO at {iso} or below and lean on exposure time instead.")

    # 3) sharpness
    allow_slow = bool(style_rules.get("allow_slow_shutter"))
    if s.sharpness < 0.0045 and shutter_val > 1 / 125 and not allow_slow:
        shutter_val = 1 / 125
        shutter = snap_shutter(shutter_val)
        shutter_val = 1 / 125
        shutter = snap_shutter(shutter_val)
        reasons.append(
            f"For crisp handheld shots keep the shutter at {shutter} or faster — slower speeds invite camera shake.")

    # 4) white balance
    wb: str | None = None
    cast_mag = max(abs(s.warmth) * 1.6, abs(s.tint) * 2.2)
    if cast_mag > 0.12:
        if s.warmth > 0.06:  # too warm -> cooling preset
            wb = next((v for v in ("tungsten", "incandescent", "fluorescent") if v in wb_opts), None)
        else:                # too cool -> warming preset
            wb = next((v for v in ("shade", "cloudy") if v in wb_opts), None)
        if wb:
            reasons.append(f"Set white balance to '{wb}' to neutralize the color cast.")

    # 5) intent nudges
    it = (intent or "").lower()
    if any(k in it for k in ("bokeh", "blur the background", "blurry background", "background blur", "portrait")):
        aperture_val = ap_pairs[0][1]
        aperture = ap_pairs[0][0]
        reasons.append(f"Since you want background blur: shoot wide open at {aperture} and get close to your subject.")
    if any(k in it for k in ("sport", "motion", "action", "bird", "pet", "kid", "child")):
        shutter_val = 1 / 500
        shutter = snap_shutter(shutter_val)
        reasons.append("For moving subjects start at 1/500s and use continuous AF (AF-C / AI Servo).")

    if not reasons:
        reasons.append("Technically solid — keep these settings and focus on composition experiments.")

    ev = 0.0
    if s.clip_hi > 0.05:
        ev = -0.7
    elif s.mean_l < 0.22:
        ev = 0.7

    raw = {
        "iso": str(iso),
        "aperture": aperture,
        "shutter_speed": shutter,
        "white_balance": wb,
        "exposure_comp": ev or None,
        "reasoning": " ".join(reasons),
    }
    clamped = clamp_recommended(camera, raw)
    return RecommendedSettings(
        iso=clamped.get("iso"),
        shutter_speed=clamped.get("shutter_speed"),
        aperture=clamped.get("aperture"),
        white_balance=clamped.get("white_balance"),
        exposure_comp=clamped.get("exposure_comp"),
        reasoning=" ".join(reasons),
    )


def _snap_by(pairs: list[tuple[str, float]], target: float) -> str:
    return min(pairs, key=lambda p: abs(p[1] - target))[0]


def rules_fmt(value) -> str:
    """Display a rule value like '1/500' or 'f/2.0' or '8\"' as-is."""
    return str(value)


# ------------------------------------------------- notes / fixes / drills


def _technical_notes(s: Stats) -> TechnicalNotes:
    return TechnicalNotes(
        exposure=(
            f"Average brightness {s.mean_l * 100:.0f}/100, with {s.clip_hi * 100:.1f}% blown highlights "
            f"and {s.clip_lo * 100:.1f}% crushed blacks."
        ),
        white_balance=(
            "Neutral — whites look white." if max(abs(s.warmth) * 1.6, abs(s.tint) * 2.2) < 0.12
            else f"Off-balance: {'warm' if s.warmth > 0 else 'cool'} shift of {abs(s.warmth) * 100:.0f}%, "
                 f"{'magenta' if s.tint > 0 else 'green'} tint of {abs(s.tint) * 100:.0f}%."
        ),
        noise=(
            "Flat areas are clean." if s.noise < 0.012
            else f"Grain visible in flat regions (noise index {s.noise:.3f})."
        ),
        sharpness=(
            "Detail is crisp." if s.sharpness >= 0.0045
            else f"Soft rendering (detail index {s.sharpness:.4f}); check shutter speed and focus."
        ),
    )


def _composition_notes(s: Stats) -> list[str]:
    notes: list[str] = []
    thirds = s.thirds
    if thirds:
        brightest = max(range(9), key=lambda i: thirds[i])
        darkest = min(range(9), key=lambda i: thirds[i])
        spread = thirds[brightest] - thirds[darkest]
        names = ["top-left", "top-center", "top-right", "middle-left", "center", "middle-right",
                 "bottom-left", "bottom-center", "bottom-right"]
        if spread > 0.20:
            notes.append(
                f"(Heuristic) The {names[brightest]} area is much brighter than the {names[darkest]} one — "
                "make sure your subject owns the brightest or most contrasting region, or recompose so it does."
            )
        if s.center_contrast > 0.10:
            notes.append("(Heuristic) The center of the frame stands out from its surroundings — good subject separation.")
        elif s.center_contrast < -0.08:
            notes.append("(Heuristic) The center is darker than the edges; if your subject is centered, consider adding light or reframing.")
        if abs(thirds[0] - thirds[2]) > 0.25 and abs(thirds[6] - thirds[8]) > 0.25:
            notes.append("(Heuristic) Strong horizontal division of light — check whether the horizon sits on a third, not dead center.")
    if not notes:
        notes.append("(Heuristic) Luminance is spread fairly evenly across the frame — no strong compositional signal either way.")
    return notes


def _fixes(s: Stats, issues: list[Issue]) -> SuggestedFixes:
    in_cam: list[str] = []
    in_post: list[str] = []
    ids = {i.id for i in issues}
    if "blown_highlights" in ids:
        in_cam.append("Expose for the highlights: use exposure compensation −1 or meter on the brightest area.")
        in_post.append("Pull highlights down — but know clipped pixels can't be fully recovered.")
    if "crushed_shadows" in ids:
        in_cam.append("Add fill light or lift shadows with exposure comp +; shoot RAW for more latitude.")
        in_post.append("Raise shadows in an editor; RAW files survive this far better than JPEGs.")
    if "exposure" in ids:
        in_cam.append("Use the exposure triangle (aperture / shutter / ISO) or exposure comp to re-center brightness.")
        in_post.append("Adjust exposure slider; prefer fixing in-camera to keep maximum quality.")
    if "color_cast" in ids:
        in_cam.append("Match the white-balance preset to the light source before shooting.")
        in_post.append("Fix white balance in post — one click with a neutral reference in frame.")
    if "noise" in ids:
        in_cam.append("Lower ISO, add light, or accept grain — avoid pushing ISO past the camera's usable range.")
        in_post.append("Apply noise reduction; it works but softens detail.")
    if "soft_focus" in ids:
        in_cam.append("Raise shutter speed (rule of thumb: 1/focal length), use AF points deliberately, brace your elbows.")
        in_post.append("Light sharpening can help; nothing fixes true motion blur.")
    if "flat_color" in ids:
        in_cam.append("Try a more vivid Picture Style / Creative Look, or shoot in better light.")
        in_post.append("Boost vibrance slightly (vibrance protects skin tones better than saturation).")
    if not in_cam:
        in_cam.append("Keep doing what you're doing — practice the drills below to build muscle memory.")
    if not in_post:
        in_post.append("Nothing urgent — the file is technically healthy.")
    return SuggestedFixes(in_camera=in_cam, in_post=in_post)


def _exercises(issues: list[Issue], style: dict | None = None) -> list[PracticeExercise]:
    ids = [i.id for i in issues]
    drills: list[PracticeExercise] = []

    if style and style.get("exercises"):
        drills.extend(
            PracticeExercise(title=e.get("title", ""), goal=e.get("goal", ""), how=e.get("how", ""))
            for e in style["exercises"][:2]
        )

    if "blown_highlights" in ids or "exposure" in ids:
        drills.append(PracticeExercise(
            title="Highlight guardian",
            goal="Take 5 photos of a bright scene where no highlight is clipped.",
            how="Turn on the histogram or 'highlight alert' playback. Meter on the brightest area, "
                "then use exposure compensation until the histogram's right edge stops touching the wall.",
        ))
    if "noise" in ids:
        drills.append(PracticeExercise(
            title="ISO ceiling hunt",
            goal="Find your camera's personal noise limit.",
            how="In the same indoor light, shoot one frame at every full ISO stop from 100 up. "
                "View at 100% and note where grain starts bothering you — that number is your ceiling.",
        ))
    if "soft_focus" in ids:
        drills.append(PracticeExercise(
            title="Shutter floor",
            goal="Find the slowest handheld shutter you can shoot cleanly.",
            how="Photograph a text sign at 1/125, 1/60, 1/30, 1/15… checking sharpness at 100% each time. "
                "Your floor is usually around 1/focal-length — e.g. 1/50s with a 50mm lens.",
        ))
    if "color_cast" in ids:
        drills.append(PracticeExercise(
            title="WB preset safari",
            goal="See what each white-balance preset does to the same scene.",
            how="Shoot one indoor scene with every WB preset in sequence. Compare — this builds the "
                "instinct to match preset to light source instead of fixing everything later.",
        ))
    drills.append(PracticeExercise(
        title="Triangle ladder",
        goal="Feel how aperture, shutter and ISO trade off.",
        how="Pick any subject. Shoot it at f/4 1/125 ISO 400, then find two more combinations with the "
            "same brightness (f/5.6 1/60 ISO 400, f/8 1/30 ISO 800…). Compare depth of field and noise.",
    ))
    drills.append(PracticeExercise(
        title="One-subject walk",
        goal="Improve composition by repetition, not gear.",
        how="Choose one subject and take 10 deliberately different photos of it: wide, close, low angle, "
            "from the side, against the light. Review which framing tells the story best.",
    ))
    return drills[:3]


# ------------------------------------------------------------------ main


class MockCoach:
    name = "mock"

    def analyze(self, image, camera: dict, settings: dict, intent: str, exif: dict, style: dict | None = None):
        s = compute_stats(image)
        issues = build_issues(s, settings, camera)
        score = _score(s, style)
        recs = build_recommendations(s, camera, settings, exif or {}, intent or "", style)
        exercises = _exercises(issues, style)

        top = issues[0] if issues else None
        style_open = f"Shooting {style['label']}: " if style else ""
        summary = (
            f"{style_open}Solid frame overall — scored {score}/100. "
            + (f"The biggest opportunity: {top.title.lower()}. {top.explanation} " if top else
               "Technically clean; now push the creative side. ")
            + "Check the recommended settings and try the drills below."
        )

        chat = (
            f"I looked at your photo through a {camera.get('brand', '')} {camera.get('model', '')} mindset "
            f"and scored it {score}/100."
            + (f" The top thing to fix: {top.title.lower()}." if top else " There's nothing urgent to fix.")
            + (f" Since you mentioned “{intent}”, I tuned the recommendations for that." if intent else "")
            + f" Suggested next shot: ISO {recs.iso}, {recs.shutter_speed}, {recs.aperture}"
            + (f", WB {recs.white_balance}" if recs.white_balance else "")
            + ". Apply them in the toolbar to preview the change."
        )

        analysis = AnalysisResult(
            overall_score=score,
            summary=summary,
            issues=issues,
            technical_notes=_technical_notes(s),
            composition_notes=_composition_notes(s),
            suggested_fixes=_fixes(s, issues),
            recommended_settings=recs,
            practice_exercises=exercises,
        )
        return analysis, chat, None

    def chat(self, message: str, history: list[dict], context: dict, image_b64: str | None = None) -> str:
        return build_chat_reply(message, context)


# ------------------------------------------------------------------- chat


def build_chat_reply(message: str, context: dict) -> str:
    """Deterministic keyword-routed chat answers from the knowledge base.

    Full conversation requires an AI engine (Setup page); this keeps the chat
    useful offline by answering common settings questions with real context.
    """
    cam = context.get("camera") or {}
    settings = context.get("settings") or {}
    style = context.get("style") or {}
    label = f"{cam.get('brand', '')} {cam.get('model', '')}".strip() or "your camera"
    m = (message or "").lower()
    style_note = f" For {style.get('label')} work: {style['recipe']['summary']}" if style else ""

    def current(key):
        return settings.get(key, "(auto)")

    if any(k in m for k in ("iso", "grain", "noise")):
        return (
            f"ISO is your sensor's sensitivity — you're at ISO {current('iso')} right now. Each full stop "
            f"(100→200→400…) doubles the light sensitivity but also doubles visible grain. On the {label}, "
            "keep ISO as low as the light allows and only raise it after setting the shutter speed and "
            "aperture you actually need." + style_note
        )
    if any(k in m for k in ("shutter", "motion", "freeze", "smear")):
        return (
            f"Shutter speed controls how long light hits the sensor — currently {current('shutter_speed')}. "
            "Fast speeds (1/500s+) freeze action; slow speeds (1/30s and below) let in more light but record "
            "camera shake and subject movement. Rule of thumb handheld: stay at 1/focal-length or faster. "
            "The simulator shows the smear — try slowing it and watch." + style_note
        )
    if any(k in m for k in ("aperture", "f-stop", "f stop", "depth of field", "dof", "bokeh", "background")):
        return (
            f"Aperture is the lens opening — you're at {current('aperture')}. Low f-numbers (f/2, f/2.8) blur "
            "the background and gather light; high f-numbers (f/8–f/16) keep everything front-to-back sharp. "
            "Want more blur? Open wider AND increase the distance between subject and background."
        )
    if any(k in m for k in ("white balance", "wb", "color cast", "cast", "orange", "blue", "tint")):
        return (
            f"White balance tells the camera what 'white' is under your light — currently {current('white_balance')}. "
            "Indoor bulbs are orange (use Tungsten/Incandescent), open shade is blue (use Shade), fluorescent "
            "tubes lean green (use Fluorescent). Pick the preset matching your light source and whites go back "
            "to white — try each preset in the toolbar to see it live."
        )
    if any(k in m for k in ("exposure", "dark", "bright", "underexposed", "overexposed")):
        return (
            "Exposure is the total light in the photo, controlled by the triangle: aperture, shutter speed and "
            f"ISO (you're at {current('aperture')}, {current('shutter_speed')}, ISO {current('iso')}). Photo too "
            "dark? Open the aperture, slow the shutter, or raise ISO — in that order of preference. Watch the "
            "histogram: push brightness toward the middle without piling up at either edge."
        )
    if any(k in m for k in ("composition", "framing", "thirds", "crop")):
        return (
            "Composition is where things sit in the frame. Start with the rule of thirds: imagine a 3×3 grid "
            "and put your subject on a line or intersection, horizon on a third. Then clean the edges — "
            "nothing distracting clipped at the border. Try 'One-subject walk' in the drills: 10 deliberately "
            "different frames of the same subject teaches more than any tip."
        )
    if any(k in m for k in ("picture style", "creative look", "profile", "monochrome", "black and white")):
        return (
            f"Picture styles are the camera's built-in look recipes — currently {current('picture_style')}. "
            "They only affect JPEGs, not RAW. Vivid/Landscape punch color, Neutral/Flat preserve editing "
            "latitude, Monochrome strips color (preview it live in the toolbar)."
        )
    if any(k in m for k in ("focus", "sharp", "blurry", "soft")):
        return (
            "Sharpness comes from three habits: fast enough shutter (1/focal length minimum handheld), "
            "deliberate AF-point choice (single point on the subject — for people, the near eye), and stable "
            f"technique (elbows in, exhale, press). Focus mode is {current('focus_mode')}; for moving subjects "
            "switch to AF-C / AI Servo."
        )
    if any(k in m for k in ("hello", "hi ", "hey", "help", "what can you", "who are you")):
        return (
            "I'm your Photo Coach. Ask me about any setting — ISO, shutter speed, aperture, white balance, "
            "focus — or what to do about a problem in your photo (too dark, grainy, blurry background…). "
            "I answer from a built-in photography knowledge base; connect an AI engine on the Setup page "
            "for full photo-specific conversations."
        )
    return (
        f"Good question. I can explain any camera setting (ISO, shutter, aperture, white balance, focus, "
        f"picture styles) or how to fix common problems (too dark, too bright, grainy, blurry). Right now "
        f"you're shooting {label} at {current('aperture')}, {current('shutter_speed')}, ISO {current('iso')}. "
        "For deeper, photo-specific back-and-forth, connect an AI engine on the Setup page."
    )
