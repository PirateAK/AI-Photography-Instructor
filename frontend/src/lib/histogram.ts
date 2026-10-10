// Histogram interpretation helpers — pure logic shared by the live overlay
// (ImageViewer) and the click-to-learn HistogramGuide. Bins are normalized to
// a 0..1 peak (64 buckets), left = shadows, right = highlights; clipLow /
// clipHigh are the fraction of pixels crushed to pure black / blown to white.

export interface HistData {
  bins: number[];
  clipLow: number;
  clipHigh: number;
}

export type VerdictTone = "good" | "warn" | "bad";

export interface Verdict {
  tone: VerdictTone;
  text: string;
}

export interface HistReading {
  mean: number; // 0..1 average brightness
  skew: "dark" | "balanced" | "bright" | null; // null = no data
  spread: "flat" | "punchy" | null;
  verdicts: Verdict[];
}

/** Brightness center-of-mass of the histogram (0 = pure black, 1 = pure white). */
export function histMean(bins: number[]): number {
  if (!bins.length) return 0;
  let sum = 0;
  let total = 0;
  for (let i = 0; i < bins.length; i++) {
    sum += bins[i] * ((i + 0.5) / bins.length);
    total += bins[i];
  }
  return total > 0 ? sum / total : 0;
}

/** Fraction of occupied tonal range — a proxy for contrast. */
function tonalSpread(bins: number[]): number {
  if (!bins.length) return 0;
  const peak = Math.max(...bins);
  if (peak <= 0) return 0;
  const used = bins.filter((b) => b > peak * 0.1).length;
  return used / bins.length;
}

/**
 * Plain-language reading of a histogram: clipping warnings, tonal lean and
 * contrast spread. Neutral phrasing — a "dark" histogram can be a correct
 * night shot; the guide explains that, it doesn't scold.
 */
export function describeHistogram(hist: HistData | null): HistReading {
  if (!hist || !hist.bins.some((b) => b > 0)) {
    return { mean: 0, skew: null, spread: null, verdicts: [] };
  }
  const mean = histMean(hist.bins);
  const spread = tonalSpread(hist.bins);
  const verdicts: Verdict[] = [];

  if (hist.clipHigh > 0.01) {
    verdicts.push({
      tone: "bad",
      text: "Highlights are clipping — the red right edge marks pixels at pure white with no recoverable detail.",
    });
  }
  if (hist.clipLow > 0.05) {
    verdicts.push({
      tone: hist.clipLow > 0.2 ? "bad" : "warn",
      text: "Shadows are clipping — the blue left edge marks pixels at pure black with no detail.",
    });
  }

  if (mean < 0.32) {
    verdicts.push({
      tone: "warn",
      text: "The shape leans left (dark). Great for night or moody scenes — a problem if you wanted an airy, bright look.",
    });
  } else if (mean > 0.68) {
    verdicts.push({
      tone: "warn",
      text: "The shape leans right (bright). Great for high-key and snow — watch that whites keep their texture.",
    });
  } else {
    verdicts.push({ tone: "good", text: "Well-balanced: most pixels sit in the flexible midtones." });
  }

  if (spread < 0.2) {
    verdicts.push({
      tone: "warn",
      text: "Narrow spread — the tonal range is squeezed into few brightness levels, which reads as flat or low contrast.",
    });
  } else if (spread > 0.55) {
    verdicts.push({
      tone: "good",
      text: "Wide spread — the photo uses the full tonal range, which reads as punchy contrast.",
    });
  }

  return { mean, skew: mean < 0.32 ? "dark" : mean > 0.68 ? "bright" : "balanced", spread: spread < 0.2 ? "flat" : spread > 0.55 ? "punchy" : null, verdicts };
}

/** Shared canvas painter for the live overlay and the guide's enlarged copy. */
export function drawHistogram(
  canvas: HTMLCanvasElement,
  hist: { bins: number[]; clipLow: number; clipHigh: number } | null,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "rgba(10, 11, 14, 0.72)";
  ctx.fillRect(0, 0, w, h);
  if (!hist) return;
  const bw = w / hist.bins.length;
  for (let i = 0; i < hist.bins.length; i++) {
    const bh = hist.bins[i] * (h - 10);
    // blue → white → red across the tonal range
    const t = i / (hist.bins.length - 1);
    ctx.fillStyle =
      t < 0.06 ? "#4a9eff" : t > 0.94 ? "#ff5a4e" : `rgba(235, 238, 245, ${0.35 + 0.5 * Math.min(1, hist.bins[i] * 3)})`;
    ctx.fillRect(i * bw, h - bh, Math.max(1, bw - 1), bh);
  }
  if (hist.clipHigh > 0.01) {
    ctx.fillStyle = "#ff453a";
    ctx.fillRect(w - 3, 0, 3, h);
  }
  if (hist.clipLow > 0.05) {
    ctx.fillStyle = "#4a9eff";
    ctx.fillRect(0, 0, 3, h);
  }
}
