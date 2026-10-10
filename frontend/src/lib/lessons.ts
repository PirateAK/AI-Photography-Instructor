// Guided lessons — deterministic, generated from the camera + style knowledge
// bases and the current analysis. The AI engine (when configured) will later
// personalize these; the structure and player stay the same.
import type { AnalysisResult, CameraModel, Lesson, LessonStep, Settings } from "./types";
import type { ShootingStyle } from "./styles";
import { baselineFromExif, defaultSettings, isDiscrete, optionsOf, parseAperture, parseShutter, snapValue, stepOption } from "./camera";
import type { ExifInfo } from "./types";

export type { Lesson };

const labelOf = (cam: CameraModel, id: string, value: string | number) =>
  isDiscrete(cam.settings[id])
    ? optionsOf(cam, id).find((o) => o.value === String(value))?.label ?? String(value)
    : String(value);

function triangleLesson(cam: CameraModel, settings: Settings, exif: ExifInfo | null): Lesson {
  const baseline = baselineFromExif(cam, exif);
  const steps: LessonStep[] = [];
  const current = { ...defaultSettings(cam), ...settings };

  const slower = stepOption(cam, "shutter_speed", String(current.shutter_speed), -1);
  if (slower && slower !== String(current.shutter_speed)) {
    steps.push({
      settingId: "shutter_speed",
      value: slower,
      narration: `Shutter ${labelOf(cam, "shutter_speed", current.shutter_speed)} → ${labelOf(cam, "shutter_speed", slower)}: the sensor collects light longer, so the preview gets brighter — but movement starts to smear.`,
      why: "Shutter is a time door. This is the motion-blur trade every photographer manages.",
    });
  }
  const higherIso = stepOption(cam, "iso", String(current.iso), 1);
  if (higherIso && higherIso !== String(current.iso)) {
    steps.push({
      settingId: "iso",
      value: higherIso,
      narration: `ISO ${labelOf(cam, "iso", current.iso)} → ${labelOf(cam, "iso", higherIso)}: brighter again, this time with more grain instead of motion blur.`,
      why: "ISO is amplification. It's the last knob you turn, not the first.",
    });
  }
  const wider = stepOption(cam, "aperture", String(current.aperture), -1);
  if (wider && wider !== String(current.aperture)) {
    steps.push({
      settingId: "aperture",
      value: wider,
      narration: `Aperture ${labelOf(cam, "aperture", current.aperture)} → ${labelOf(cam, "aperture", wider)}: more light AND more background blur — the two jobs aperture does at once.`,
      why: "Notice the blur only increases opening wider than the as-shot aperture — you can't un-blur a photo.",
    });
  }
  const comp = Number(current.exposure_comp ?? 0);
  steps.push({
    settingId: "exposure_comp",
    value: Number((comp + 2 / 3).toFixed(3)),
    narration: "Exposure compensation +⅔ EV: brightness nudged without touching the triangle — the fastest 'make it brighter' tool.",
    why: "EV compensation tells the camera's auto mode to deviate from its own meter reading.",
  });
  return {
    id: "triangle",
    title: "Exposure triangle, hands on",
    description: `Feel how shutter, ISO and aperture trade off on this photo (as-shot baseline: ISO ${baseline.iso}, ${exif?.shutter_speed ?? "1/125"}, ${exif?.aperture ?? "f/4"}).`,
    steps,
  };
}

function styleRecipeLesson(cam: CameraModel, settings: Settings, style: ShootingStyle): Lesson {
  const steps: LessonStep[] = Object.entries(style.recipe.settings).map(([settingId, value]) => ({
    settingId,
    value: value as string | number,
    narration: `${cam.settings[settingId]?.label ?? settingId} → ${labelOf(cam, settingId, value as string | number)}`,
    why: style.recipe.why,
  }));
  return {
    id: `recipe-${style.id}`,
    title: `${style.emoji} ${style.label}: build the recipe`,
    description: style.recipe.summary,
    steps,
  };
}

function fixTourLesson(cam: CameraModel, settings: Settings, analysis: AnalysisResult): Lesson {
  const recs = analysis.recommended_settings;
  const steps: LessonStep[] = [];
  const pairs: [string, string | number | null | undefined, string][] = [
    ["aperture", recs.aperture, "opens or closes the lens — watch depth of field and brightness"],
    ["shutter_speed", recs.shutter_speed, "controls motion and light — watch the smear change"],
    ["iso", recs.iso, "trades brightness for grain"],
    ["white_balance", recs.white_balance, "shifts colors toward neutral"],
  ];
  for (const [settingId, value, hook] of pairs) {
    if (!value) continue;
    const from = settings[settingId] ?? defaultSettings(cam)[settingId];
    if (String(from) === String(value)) continue;
    steps.push({
      settingId,
      value: value as string | number,
      narration: `${cam.settings[settingId]?.label ?? settingId} ${labelOf(cam, settingId, String(from))} → ${labelOf(cam, settingId, String(value))} — this ${hook}.`,
      why: recs.reasoning,
    });
  }
  if (typeof recs.exposure_comp === "number" && recs.exposure_comp !== 0) {
    steps.push({
      settingId: "exposure_comp",
      value: recs.exposure_comp,
      narration: `Exposure comp ${recs.exposure_comp > 0 ? "+" : ""}${recs.exposure_comp} EV to finish the exposure correction.`,
      why: recs.reasoning,
    });
  }
  return {
    id: "fix-tour",
    title: "Fix this photo, step by step",
    description: recs.reasoning,
    steps,
  };
}

export function buildLessons(
  cam: CameraModel,
  settings: Settings,
  exif: ExifInfo | null,
  style: ShootingStyle | undefined,
  analysis: AnalysisResult | null,
): Lesson[] {
  const lessons: Lesson[] = [];
  if (analysis) lessons.push(fixTourLesson(cam, settings, analysis));
  if (style) {
    lessons.push(...styleKbLessons(cam, style));
    lessons.push(styleRecipeLesson(cam, settings, style));
  }
  lessons.push(triangleLesson(cam, settings, exif));
  return lessons.filter((l) => l.steps.length > 0);
}

/**
 * Guided lessons saved on the style (AI-drafted, instructor-approved). Draft
 * lessons are invisible to learners until approved in the Style Manager.
 * Step values snap onto the current camera — "f/11" becomes the closest
 * supported stop; steps the camera can't apply are dropped.
 */
function styleKbLessons(cam: CameraModel, style: ShootingStyle): Lesson[] {
  const out: Lesson[] = [];
  for (const l of style.lessons ?? []) {
    if (l.draft) continue;
    const steps: LessonStep[] = [];
    for (const st of l.steps) {
      const value = snapValue(cam, st.settingId, st.value);
      if (value === null) continue;
      steps.push({ settingId: st.settingId, value, narration: st.narration, why: st.why });
    }
    if (steps.length) {
      out.push({
        id: `style-${style.id}-${l.id}`,
        title: `${style.emoji} ${l.title}`,
        description: l.description,
        steps,
      });
    }
  }
  return out;
}
