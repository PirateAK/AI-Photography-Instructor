// Lens catalog + swap-simulation helpers (data/lenses.json).
// Mount compatibility is derived from the camera body line:
//   Canon "EOS R*" mirrorless -> RF, Canon DSLRs -> EF (EF-S lenses fit APS-C EF bodies),
//   Sony -> E, Nikon -> Z.
import lensesJson from "../../../data/lenses.json";
import type { CameraModel, DiscreteSetting, ExifInfo } from "./types";
import { parseAperture } from "./camera";

export interface Lens {
  id: string;
  brand: string;
  mount: "EF" | "RF" | "E" | "Z";
  model: string;
  kind: "prime" | "zoom";
  min_focal_mm: number;
  max_focal_mm: number;
  max_aperture: number;
  min_aperture: number;
  image_stabilization: boolean;
  weight_g: number;
  price_used_usd: number;
  note: string;
}

export interface LensCatalog {
  version: number;
  lenses: Lens[];
}

export const lensCatalog = lensesJson as unknown as LensCatalog;

export function getLenses(): Lens[] {
  return lensCatalog.lenses;
}

export function getLensById(id: string | undefined | null): Lens | undefined {
  if (!id) return undefined;
  return lensCatalog.lenses.find((l) => l.id === id);
}

export type Mount = "EF" | "RF" | "E" | "Z";

/** Mount for a camera body (documented derivation — see file header).
 *  Phones have no mount: null. */
export function mountOf(cam: CameraModel): Mount | null {
  if (cam.body?.type === "phone") return null;
  if (cam.brand === "Sony") return "E";
  if (cam.brand === "Nikon") return "Z";
  // Canon: mirrorless R-line = RF; DSLRs (EOS 60D, 5D IV, 7D II, Rebel) = EF
  return /\bR\d|R5|R6|R7|R8|R3|RP|R100|R50|R10\b/.test(cam.model) ? "RF" : "EF";
}

/** Lenses that physically fit a camera. Phones: none — the lens is built in. */
export function lensesForCamera(cam: CameraModel): Lens[] {
  const mount = mountOf(cam);
  if (!mount) return [];
  return lensCatalog.lenses.filter((l) => l.mount === mount);
}

/** The default lens shown for a camera (first compatible = its typical kit). */
export function defaultLensForCamera(cam: CameraModel): Lens | undefined {
  return lensesForCamera(cam)[0];
}

/**
 * Aperture options the lens actually offers, as a DiscreteSetting that
 * replaces the camera's generic aperture block on the toolbar.
 */
export function lensApertureDef(lens: Lens): DiscreteSetting {
  const stops = [1.2, 1.4, 1.8, 2, 2.8, 3.5, 4, 4.5, 5.6, 8, 11, 16, 22, 32, 36];
  const options = stops
    .filter((s) => s >= lens.max_aperture - 0.01 && s <= lens.min_aperture + 0.01)
    .map((s) => ({ value: `f/${s}`, label: `f/${s}` }));
  return {
    type: "discrete",
    label: "Aperture",
    default: options[0]?.value ?? "f/5.6",
    beginner:
      "The size of the lens opening — but your choice of LENS decides how far it can open. " +
      "This lens opens to " +
      `f/${lens.max_aperture}` +
      (lens.kind === "zoom" ? ` at ${lens.min_focal_mm}mm.` : " at every distance.") +
      " Low f-numbers let in more light and blur the background; high f-numbers keep more in focus.",
    options,
  };
}

/** Parse EXIF focal length ("135mm") to a number. */
export function parseFocal(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value > 0 ? value : null;
  const m = String(value).match(/([\d.]+)/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return v > 0 ? v : null;
}

/**
 * Framing zoom when swapping lenses: focal_new / focal_as-shot, clamped.
 * Longer lens -> tighter crop (>1). A wider lens than the shot reveals nothing
 * new (the photo already exists), so ratios below 1 clamp to 1.
 */
export function focalZoomRatio(lens: Lens, exif: ExifInfo | null): number {
  const shotFocal = parseFocal(exif?.focal_length);
  if (!shotFocal) return 1;
  const target = Math.min(lens.max_focal_mm, Math.max(lens.min_focal_mm, shotFocal));
  const ratio = target / shotFocal;
  return Math.max(1, Math.min(4, Math.round(ratio * 100) / 100));
}

/** IS raises the handheld shake threshold by ~4 stops (1/60s -> ~1/4s). */
export function shakeThresholdSec(lens: Lens | undefined): number {
  return (1 / 60) * (lens?.image_stabilization ? Math.pow(2, 4) : 1);
}

/** If the current aperture is wider than the lens allows, snap it back. */
export function clampApertureToLens(current: string, lens: Lens): string {
  const n = parseAperture(current);
  if (n === null || n >= lens.max_aperture - 0.01) return current;
  // snap to the lens's widest stop
  const stops = [1.2, 1.4, 1.8, 2, 2.8, 3.5, 4, 4.5, 5.6, 8, 11, 16, 22];
  const allowed = stops.filter((s) => s >= lens.max_aperture - 0.01);
  const best = allowed.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a), allowed[0]);
  return `f/${best}`;
}
