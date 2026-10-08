// Local "Coach tip" explanations shown when a setting changes.
// These are deterministic text (no AI calls, no cost); the AI coach handles
// full photo analysis, while these explain the mechanics of each change.
import type { CameraModel, Settings } from "./types";
import { isDiscrete, optionsOf, parseAperture, parseShutter } from "./camera";

export interface Tip {
  short: string;
  why: string;
}

const fmtShutter = (v: string | number) => String(v).replace('"', "s");

export function tipFor(
  cam: CameraModel,
  settings: Settings,
  settingId: string,
  oldValue: string | number | undefined,
  newValue: string | number,
): Tip | null {
  if (oldValue === undefined || String(oldValue) === String(newValue)) return null;

  switch (settingId) {
    case "iso": {
      const up = Number(newValue) > Number(oldValue);
      return {
        short: `ISO ${oldValue} → ${newValue}: sensor is ${up ? "more" : "less"} sensitive — preview goes ${
          up ? "brighter, but grainier" : "darker and cleaner"
        }.`,
        why:
          "Each full ISO stop doubles (or halves) the sensor's sensitivity. Raising ISO is a trade: brighter image, " +
          "but more electronic noise. Use it only after you've set the aperture and shutter speed you actually need — " +
          "it's the last knob, not the first.",
      };
    }
    case "shutter_speed": {
      const oldT = parseShutter(oldValue) ?? 0;
      const newT = parseShutter(newValue) ?? 0;
      const faster = newT < oldT;
      return {
        short: `Shutter ${fmtShutter(oldValue)} → ${fmtShutter(newValue)}: ${
          faster ? "less light, motion frozen more" : "more light, but motion blur creeps in"
        }.`,
        why:
          "The shutter is a time door. Fast speeds (1/500s+) freeze runners, pets, kids. Slow speeds (1/30s and below) " +
          "let light pour in but record every wobble — below about 1/60s handheld, camera shake starts showing. " +
          "Rule of thumb: stay at 1/focal-length or faster (1/50s with a 50mm lens).",
      };
    }
    case "aperture": {
      const oldN = parseAperture(oldValue) ?? 0;
      const newN = parseAperture(newValue) ?? 0;
      const wider = newN < oldN;
      return {
        short: `Aperture ${oldValue} → ${newValue}: ${
          wider ? "more light and more background blur" : "more of the scene in focus, less light"
        }.`,
        why:
          "Aperture is the pupil of your lens. Small f-numbers (f/1.8, f/2.8) open it wide: great in low light and " +
          "for that blurry-background portrait look. Large f-numbers (f/11, f/16) close it down: landscapes and groups " +
          "stay sharp front-to-back. The blur you see when opening up is the simulation adding depth-of-field.",
      };
    }
    case "exposure_comp": {
      const delta = Number(newValue) - Number(oldValue);
      const up = delta > 0;
      return {
        short: `Exposure comp ${delta > 0 ? "+" : ""}${delta.toFixed(1)} EV: whole preview ${
          up ? "brightened" : "darkened"
        } without touching the triangle.`,
        why:
          "Exposure compensation tells the camera's auto mode 'make it brighter/darker than you think'. " +
          "+1 EV = twice as much light, −1 EV = half. Useful when the camera's meter gets fooled by snow (add +) " +
          "or dark backgrounds (subtract −).",
      };
    }
    case "white_balance": {
      const label = optionsOf(cam, "white_balance").find((o) => o.value === String(newValue))?.label ?? newValue;
      const hints: Record<string, string> = {
        tungsten: "cools the preview to cancel orange bulbs",
        incandescent: "cools the preview to cancel orange bulbs",
        fluorescent: "adds magenta to cancel green tube light",
        shade: "warms the preview to cancel blue skylight",
        cloudy: "warms the preview slightly",
        daylight: "neutral in direct sun",
        flash: "slightly cool, tuned for flash light",
        auto: "camera guesses — usually decent, sometimes surprised",
        kelvin: "you pick the exact color temperature",
        custom: "uses your saved custom measurement",
      };
      const hint = hints[String(newValue)] ?? "shifts the color rendering";
      return {
        short: `White balance → ${label}: ${hint}. Colors change, brightness doesn't.`,
        why:
          "White balance tells the camera what 'neutral' looks like under this light. Indoor bulbs are orange, open " +
          "shade is blue, fluorescent tubes lean green — pick the preset matching your light source and whites go " +
          "back to white. WB is easy to fix in post when shooting RAW, but nailing it in camera saves time.",
      };
    }
    case "picture_style": {
      const label = optionsOf(cam, "picture_style").find((o) => o.value === String(newValue))?.label ?? newValue;
      return {
        short: `Picture style → ${label}: changed the contrast / color / sharpness recipe of the preview.`,
        why:
          "Picture Styles (Creative Looks on Sony, Picture Controls on Nikon) are the camera's built-in film recipes. " +
          "They only affect JPEGs — RAW files ignore them. Vivid/Landscape punch color; Neutral/Flat keep detail for " +
          "editing; Monochrome strips color (the preview shows it live).",
      };
    }
    case "focus_mode": {
      const label = optionsOf(cam, "focus_mode").find((o) => o.value === String(newValue))?.label ?? newValue;
      return {
        short: `Focus mode → ${label}. This changes how the camera focuses next time — it can't alter an already-shot photo.`,
        why:
          "One-Shot / AF-S locks focus for still subjects. AI Servo / AF-C keeps re-focusing on moving subjects. " +
          "AI Focus / AF-A lets the camera decide. Manual (MF) is yours to control — great for tricky light or macro.",
      };
    }
    case "metering_mode": {
      const label = optionsOf(cam, "metering_mode").find((o) => o.value === String(newValue))?.label ?? newValue;
      return {
        short: `Metering → ${label}. This changes how the camera judges brightness next time — the preview pixels don't change.`,
        why:
          "Metering is how the camera decides what 'correct exposure' means. Evaluative/Matrix reads the whole scene; " +
          "Center-weighted favors the middle; Spot reads a tiny patch. Backlit subject turning into a silhouette? " +
          "Switch to spot metering on their face.",
      };
    }
    default:
      return null;
  }
}

/** Friendly tips shown if the AI provider fails entirely. */
export const FALLBACK_TIPS: string[] = [
  "Check the histogram after every shot — push brightness toward the middle without clipping either edge.",
  "Start with aperture for the look you want (blurry background vs everything sharp), then set shutter for motion, then raise ISO only as needed.",
  "Keep handheld shutter speeds at 1/focal-length or faster to avoid shake.",
  "Match the white-balance preset to your light source: bulbs → Tungsten/Incandescent, shade → Shade.",
];
