// Simulation engine — maps camera settings onto deterministic image transforms.
//
// IMPORTANT: this is an explicit *approximation* for teaching purposes, not a
// physically accurate renderer. Every preview is labeled "simulation" in the UI.
//
// Pipeline (renderPreview):
//   1. motion smear (repeated offset draws)          [shutter speed]
//   2. GPU filter pass: brightness / contrast / saturation  [exposure triangle, EV comp, Picture Style]
//   3. pixel pass: white-balance shift, grain, B&W, light unsharp  [WB, ISO, style]
//   4. depth-of-field: blurred copy masked by a radial "sharp center" [aperture]
import type { CameraModel, Settings } from "./types";
import { parseAperture, parseShutter } from "./camera";

export interface SimParams {
  gain: number; // linear brightness multiplier (exposure)
  contrast: number; // -0.3 .. 0.3
  saturation: number; // multiplier, 0 = B&W
  tempShift: number; // -1 (cool) .. 1 (warm)
  tintShift: number; // -1 (green) .. 1 (magenta)
  sharpen: number; // 0..1 unsharp amount
  noise: number; // 0..1.2 grain amplitude
  dofBlurPx: number; // background blur radius
  motionPx: number; // directional smear length
  mono: boolean;
}

export interface Baseline {
  iso: number;
  shutter: number;
  aperture: number;
}

export function identityParams(): SimParams {
  return {
    gain: 1,
    contrast: 0,
    saturation: 1,
    tempShift: 0,
    tintShift: 0,
    sharpen: 0,
    noise: 0,
    dofBlurPx: 0,
    motionPx: 0,
    mono: false,
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// White-balance presets → (temperature, tint) rendering shifts.
// temp > 0 = warm/orange rendering, tint > 0 = magenta rendering.
const WB_SHIFTS: Record<string, { temp: number; tint: number }> = {
  auto: { temp: 0, tint: 0 },
  daylight: { temp: 0.05, tint: 0.01 },
  shade: { temp: 0.30, tint: 0.02 },
  cloudy: { temp: 0.16, tint: 0.02 },
  tungsten: { temp: -0.32, tint: 0.04 },
  incandescent: { temp: -0.32, tint: 0.04 },
  fluorescent: { temp: -0.14, tint: -0.12 },
  flash: { temp: 0.10, tint: 0.0 },
  custom: { temp: 0, tint: 0 },
};

function kelvinShift(kelvin: number): { temp: number; tint: number } {
  // Higher Kelvin target → warmer rendering (matches camera WB behavior).
  return { temp: clamp((kelvin - 5500) / 4500, -1, 1), tint: 0 };
}

// Picture Styles / Creative Looks / Picture Controls → look recipe.
const STYLES: Record<string, { contrast: number; saturation: number; sharpen: number; mono?: boolean }> = {
  standard: { contrast: 0.04, saturation: 1.06, sharpen: 0.18 },
  portrait: { contrast: 0.0, saturation: 0.92, sharpen: 0.1 },
  landscape: { contrast: 0.12, saturation: 1.18, sharpen: 0.26 },
  neutral: { contrast: -0.08, saturation: 0.88, sharpen: 0.05 },
  faithful: { contrast: 0.0, saturation: 1.0, sharpen: 0.12 },
  vivid: { contrast: 0.14, saturation: 1.26, sharpen: 0.22 },
  cinema: { contrast: 0.1, saturation: 0.85, sharpen: 0.1 },
  flat: { contrast: -0.15, saturation: 0.8, sharpen: 0.02 },
  monochrome: { contrast: 0.08, saturation: 1.0, sharpen: 0.2, mono: true },
};

/** settings → simulation parameters, relative to the as-shot baseline. */
export function settingsToSimParams(
  cam: CameraModel,
  settings: Settings,
  baseline: Baseline,
): SimParams {
  const iso = Number(settings.iso) || baseline.iso;
  const t = parseShutter(settings.shutter_speed) ?? baseline.shutter;
  const n = parseAperture(settings.aperture) ?? baseline.aperture;
  const evComp = Number(settings.exposure_comp) || 0;

  // brightness ∝ shutter · ISO / aperture²  → EV delta vs baseline
  const ev =
    Math.log2((t / baseline.shutter) * (iso / baseline.iso) * Math.pow(baseline.aperture / n, 2)) +
    evComp;
  const gain = clamp(Math.pow(2, ev), 0.12, 6);

  // grain grows ~ with sqrt of ISO ratio above the as-shot ISO
  const noise = clamp(Math.max(0, Math.pow(iso / baseline.iso, 0.55) - 1) * 0.9, 0, 1.2);

  // handheld camera shake below ~1/60s → directional smear
  const motionPx = t > 1 / 60 ? clamp(14 * Math.log2(t * 60) + 3, 0, 40) : 0;

  // opening the aperture wider than as-shot → background blur (cannot "un-blur")
  const dofBlurPx =
    n < baseline.aperture ? clamp(22 * Math.log2(baseline.aperture / n) * 0.55, 0, 26) : 0;

  const wbKey = String(settings.white_balance ?? "auto");
  const wb =
    wbKey === "kelvin"
      ? kelvinShift(Number(settings.wb_kelvin ?? 5500))
      : WB_SHIFTS[wbKey] ?? { temp: 0, tint: 0 };

  const style = STYLES[String(settings.picture_style ?? "standard")] ?? STYLES.standard;

  return {
    gain,
    contrast: style.contrast,
    saturation: style.mono ? 0 : style.saturation,
    tempShift: clamp(wb.temp, -1, 1),
    tintShift: clamp(wb.tint, -1, 1),
    sharpen: style.sharpen,
    noise,
    dofBlurPx,
    motionPx,
    mono: !!style.mono,
  };
}

// ---------------------------------------------------------------- rendering

const MAX_PREVIEW_DIM = 1280;

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** Deterministic PRNG so grain doesn't "boil" between renders. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 3x3 box blur (separable) on RGBA data — cheap base for unsharp masking. */
function boxBlur(src: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const tmp = new Uint8ClampedArray(src.length);
  const out = new Uint8ClampedArray(src.length);
  // horizontal
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) {
        const i = (y * w + x) * 4 + c;
        const l = x > 0 ? src[i - 4] : src[i];
        const r = x < w - 1 ? src[i + 4] : src[i];
        tmp[i] = (l + src[i] + r) / 3;
      }
      tmp[(y * w + x) * 4 + 3] = src[(y * w + x) * 4 + 3];
    }
  }
  // vertical
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) {
        const i = (y * w + x) * 4 + c;
        const u = y > 0 ? tmp[i - w * 4] : tmp[i];
        const d = y < h - 1 ? tmp[i + w * 4] : tmp[i];
        out[i] = (u + tmp[i] + d) / 3;
      }
      out[(y * w + x) * 4 + 3] = tmp[(y * w + x) * 4 + 3];
    }
  }
  return out;
}

/** Render the simulated preview of `source` into `out`. */
export function renderPreview(
  source: HTMLCanvasElement,
  params: SimParams,
  out: HTMLCanvasElement,
  focus?: { x: number; y: number },
): void {
  const w = source.width;
  const h = source.height;
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) return;

  // 1. motion smear
  let base: HTMLCanvasElement = source;
  if (params.motionPx >= 0.75) {
    const m = makeCanvas(w, h);
    const mctx = m.getContext("2d");
    if (mctx) {
      mctx.drawImage(source, 0, 0);
      mctx.globalAlpha = 0.22;
      const p = params.motionPx;
      for (let i = 1; i <= 5; i++) {
        const off = (p * i) / 5;
        mctx.drawImage(source, -off, 0);
        mctx.drawImage(source, off, 0);
      }
      mctx.globalAlpha = 1;
      base = m;
    }
  }

  // 2. exposure / contrast / saturation via GPU filter
  ctx.save();
  ctx.filter = `brightness(${params.gain.toFixed(3)}) contrast(${(1 + params.contrast).toFixed(
    3,
  )}) saturate(${params.saturation.toFixed(3)})`;
  ctx.drawImage(base, 0, 0);
  ctx.restore();

  // 3. pixel pass: WB shift, unsharp, grain, B&W
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  const doSharpen = params.sharpen > 0.02;
  const blurred = doSharpen ? boxBlur(data, w, h) : null;
  const amount = params.sharpen * 1.4;

  const needsWb = Math.abs(params.tempShift) > 0.005 || Math.abs(params.tintShift) > 0.005;
  const rand = mulberry32(0xc0ffee);
  const noiseAmp = params.noise * 46;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    if (needsWb) {
      r *= 1 + params.tempShift * 0.22 + params.tintShift * 0.08;
      g *= 1 - params.tintShift * 0.18;
      b *= 1 - params.tempShift * 0.22 + params.tintShift * 0.08;
    }

    if (blurred) {
      r += amount * (r - blurred[i]);
      g += amount * (g - blurred[i + 1]);
      b += amount * (b - blurred[i + 2]);
    }

    if (params.mono) {
      const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = g = b = gray;
    }

    if (noiseAmp > 0.5) {
      // ~gaussian from 3 uniforms (Irwin–Hall), fixed seed per render
      const grain = (rand() + rand() + rand() - 1.5) * noiseAmp;
      r += grain;
      g += grain;
      b += grain;
    }

    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
  ctx.putImageData(imageData, 0, 0);

  // 4. depth of field: blurred copy + sharp center via radial mask
  if (params.dofBlurPx >= 0.75) {
    const blurredC = makeCanvas(w, h);
    const bctx = blurredC.getContext("2d");
    if (bctx) {
      bctx.filter = `blur(${params.dofBlurPx.toFixed(1)}px)`;
      bctx.drawImage(out, 0, 0);
      bctx.filter = "none";

      const mask = makeCanvas(w, h);
      const mctx = mask.getContext("2d");
      if (mctx) {
        mctx.drawImage(out, 0, 0);
        mctx.globalCompositeOperation = "destination-in";
        const fx = (focus?.x ?? 0.5) * w;
        const fy = (focus?.y ?? 0.5) * h;
        const radius = Math.max(w, h) * 0.75;
        const grad = mctx.createRadialGradient(fx, fy, radius * 0.16, fx, fy, radius * 0.62);
        grad.addColorStop(0, "rgba(0,0,0,1)");
        grad.addColorStop(1, "rgba(0,0,0,0)");
        mctx.fillStyle = grad;
        mctx.fillRect(0, 0, w, h);
        bctx.drawImage(mask, 0, 0);
        ctx.drawImage(blurredC, 0, 0);
      }
    }
  }
}

/** Luminance histogram (64 bins) from a rendered canvas — for the live overlay. */
export function computeHistogram(canvas: HTMLCanvasElement): { bins: number[]; clipLow: number; clipHigh: number } | null {
  const ctx = canvas.getContext("2d");
  if (!ctx || !canvas.width) return null;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const bins = new Array(64).fill(0);
  let clipLow = 0;
  let clipHigh = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 16) {
    // sample every 4th pixel
    const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    bins[Math.min(63, Math.floor((l / 256) * 64))]++;
    if (l >= 250) clipHigh++;
    if (l <= 5) clipLow++;
    n++;
  }
  const max = Math.max(...bins, 1);
  return {
    bins: bins.map((b) => b / max),
    clipLow: clipLow / n,
    clipHigh: clipHigh / n,
  };
}

/** Decode an image file to a preview-sized source canvas. */
export async function loadSourceCanvas(dataUrl: string): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.src = dataUrl;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Could not decode image"));
  });
  const scale = Math.min(1, MAX_PREVIEW_DIM / Math.max(img.width, img.height));
  const canvas = makeCanvas(Math.round(img.width * scale), Math.round(img.height * scale));
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}
