import { describe, expect, it } from "vitest";

import { describeHistogram, histMean, type HistData } from "../src/lib/histogram";

function hist(bins: number[], clipLow = 0, clipHigh = 0): HistData {
  return { bins, clipLow, clipHigh };
}

const EMPTY = new Array(64).fill(0);
const spike = (idx: number) => EMPTY.map((_, i) => (i === idx ? 1 : 0));

describe("histMean", () => {
  it("is 0 for an empty histogram", () => {
    expect(histMean(EMPTY)).toBe(0);
  });

  it("puts a left-wall spike near 0 and a right-wall spike near 1", () => {
    expect(histMean(spike(0))).toBeLessThan(0.02);
    expect(histMean(spike(63))).toBeGreaterThan(0.98);
  });

  it("centers a uniform histogram at 0.5", () => {
    const uniform = new Array(64).fill(1);
    expect(histMean(uniform)).toBeCloseTo(0.5, 5);
  });
});

describe("describeHistogram", () => {
  it("returns null skew and no verdicts for missing or empty data", () => {
    expect(describeHistogram(null).skew).toBeNull();
    const empty = describeHistogram(hist(EMPTY));
    expect(empty.skew).toBeNull();
    expect(empty.verdicts).toHaveLength(0);
  });

  it("flags highlight clipping", () => {
    const r = describeHistogram(hist(spike(30), 0, 0.03));
    expect(r.verdicts.some((v) => v.tone === "bad" && v.text.includes("Highlights"))).toBe(true);
  });

  it("flags shadow clipping", () => {
    const r = describeHistogram(hist(spike(30), 0.08));
    expect(r.verdicts.some((v) => v.text.includes("Shadows"))).toBe(true);
  });

  it("escalates heavy shadow clipping to bad", () => {
    const r = describeHistogram(hist(spike(30), 0.25));
    const shadow = r.verdicts.find((v) => v.text.includes("Shadows"))!;
    expect(shadow.tone).toBe("bad");
  });

  it("reads a dark-leaning histogram", () => {
    const r = describeHistogram(hist(spike(8)));
    expect(r.skew).toBe("dark");
    expect(r.verdicts.some((v) => v.text.includes("leans left"))).toBe(true);
  });

  it("reads a bright-leaning histogram", () => {
    const r = describeHistogram(hist(spike(56)));
    expect(r.skew).toBe("bright");
    expect(r.verdicts.some((v) => v.text.includes("leans right"))).toBe(true);
  });

  it("reads a balanced histogram as good", () => {
    const r = describeHistogram(hist(spike(32)));
    expect(r.skew).toBe("balanced");
    expect(r.verdicts.some((v) => v.tone === "good" && v.text.includes("Well-balanced"))).toBe(true);
  });

  it("detects a narrow, flat spread", () => {
    const r = describeHistogram(hist(spike(32)));
    expect(r.spread).toBe("flat");
    expect(r.verdicts.some((v) => v.text.includes("Narrow spread"))).toBe(true);
  });

  it("detects a wide, punchy spread", () => {
    // energy across most of the tonal range
    const wide = EMPTY.map((_, i) => (i < 44 ? 1 : 0.2));
    const r = describeHistogram(hist(wide));
    expect(r.spread).toBe("punchy");
    expect(r.verdicts.some((v) => v.tone === "good" && v.text.includes("Wide spread"))).toBe(true);
  });
});
