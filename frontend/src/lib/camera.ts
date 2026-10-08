// Camera catalog helpers. The catalog lives in /data/camera_models.json —
// one file shared by frontend and backend. Adding a camera = editing JSON only.
import catalogJson from "../../../data/camera_models.json";
import type {
  CameraCatalog,
  CameraModel,
  DiscreteSetting,
  ExifInfo,
  RangeSetting,
  SettingDef,
  Settings,
  SettingOption,
} from "./types";

export const catalog = catalogJson as unknown as CameraCatalog;

export function getCameras(): CameraModel[] {
  return catalog.cameras;
}

export function getCamera(id: string): CameraModel | undefined {
  return catalog.cameras.find((c) => c.id === id);
}

export function isDiscrete(def: SettingDef | undefined): def is DiscreteSetting {
  return !!def && def.type === "discrete";
}

export function isRange(def: SettingDef | undefined): def is RangeSetting {
  return !!def && def.type === "range";
}

export function optionsOf(cam: CameraModel, settingId: string): SettingOption[] {
  const def = cam.settings[settingId];
  return isDiscrete(def) ? def.options : [];
}

/** Default settings for a camera (from its JSON "defaults"). */
export function defaultSettings(cam: CameraModel): Settings {
  return { ...cam.defaults };
}

/** Parse "1/250" → 0.004, "30\"" → 30, 0.5 → 0.5. */
export function parseShutter(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value > 0 ? value : null;
  const s = String(value).trim().replace('"', "").replace(/s$/i, "");
  if (!s) return null;
  if (s.includes("/")) {
    const [num, den] = s.split("/");
    const d = parseFloat(den);
    if (!d) return null;
    return parseFloat(num) / d;
  }
  const v = parseFloat(s);
  return v > 0 ? v : null;
}

/** Parse "f/2.8" → 2.8. */
export function parseAperture(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value > 0 ? value : null;
  const m = String(value).match(/([\d.]+)/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return v > 0 ? v : null;
}

export interface Baseline {
  iso: number;
  shutter: number;
  aperture: number;
}

/** As-shot baseline from EXIF when available, otherwise camera defaults. */
export function baselineFromExif(cam: CameraModel, exif: ExifInfo | null): Baseline {
  const d = defaultSettings(cam);
  const iso =
    exif?.iso && exif.iso > 0 ? exif.iso : Number(d.iso) || 200;
  const shutter = parseShutter(exif?.shutter_speed) ?? parseShutter(d.shutter_speed) ?? 1 / 125;
  const aperture = parseAperture(exif?.aperture) ?? parseAperture(d.aperture) ?? 4;
  return { iso, shutter, aperture };
}

/** Clamp an EV value to the camera's exposure-comp range, snapped to step. */
export function clampEv(cam: CameraModel, ev: number): number {
  const def = cam.settings.exposure_comp;
  if (!isRange(def)) return ev;
  const stepped = Math.round(ev / def.step) * def.step;
  return Math.max(def.min, Math.min(def.max, Number(stepped.toFixed(3))));
}

/** Move through a discrete setting's options by ±1 step. */
export function stepOption(
  cam: CameraModel,
  settingId: string,
  current: string,
  dir: 1 | -1,
): string | null {
  const opts = optionsOf(cam, settingId);
  const idx = opts.findIndex((o) => o.value === current);
  if (idx === -1) return opts.length ? (dir === 1 ? opts[0].value : opts[opts.length - 1].value) : null;
  const next = Math.max(0, Math.min(opts.length - 1, idx + dir));
  return opts[next].value;
}

/** ISO value above the model's "usable_max" annotation? */
export function isHighIso(cam: CameraModel, isoValue: string): boolean {
  const def = cam.settings.iso;
  if (!isDiscrete(def) || !def.usable_max) return false;
  return Number(isoValue) > Number(def.usable_max);
}

/** Map settings onto the camera's supported values (for applying recommendations). */
export function clampToCamera(cam: CameraModel, wanted: Settings): Settings {
  const out: Settings = {};
  for (const [key, value] of Object.entries(wanted)) {
    if (value === null || value === undefined) continue;
    const def = cam.settings[key];
    if (!def) continue;
    if (isDiscrete(def)) {
      const match = def.options.find((o) => o.value === value);
      if (match) out[key] = match.value;
      else if (key === "iso") {
        // snap to nearest ISO stop
        const opts = def.options.map((o) => ({ v: o.value, n: Number(o.value) }));
        const target = Number(value);
        out[key] = opts.reduce((best, o) => (Math.abs(o.n - target) < Math.abs(Number(best.v) - target) ? o : best), opts[0]).v;
      } else if (key === "exposure_comp" && isRange(def)) {
        out[key] = clampEv(cam, Number(value));
      }
    } else if (isRange(def)) {
      out[key] = clampEv(cam, Number(value));
    }
  }
  return out;
}

/** Parse a discrete option's numeric value according to its setting id. */
function numericOf(settingId: string, value: string): number | null {
  if (settingId === "iso") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (settingId === "aperture") return parseAperture(value);
  if (settingId === "shutter_speed") return parseShutter(value);
  return null;
}

/**
 * Snap arbitrary wanted settings onto a camera's supported options.
 * Exact matches pass through; otherwise numeric options (ISO, aperture,
 * shutter) snap to the nearest supported stop; everything else is dropped.
 */
export function snapToCamera(cam: CameraModel, wanted: Settings): Settings {
  const out: Settings = {};
  for (const [key, value] of Object.entries(wanted)) {
    if (value === null || value === undefined) continue;
    const def = cam.settings[key];
    if (!def) continue;
    if (isRange(def)) {
      out[key] = clampEv(cam, Number(value));
      continue;
    }
    if (!isDiscrete(def)) continue;
    const str = String(value);
    if (def.options.some((o) => o.value === str)) {
      out[key] = str;
      continue;
    }
    const target = numericOf(key, str);
    if (target === null) continue;
    const parsed = def.options
      .map((o) => ({ val: o.value, n: numericOf(key, o.value) }))
      .filter((o): o is { val: string; n: number } => o.n !== null);
    if (!parsed.length) continue;
    out[key] = parsed.reduce((best, o) => (Math.abs(o.n - target) < Math.abs(best.n - target) ? o : best)).val;
  }
  return out;
}
