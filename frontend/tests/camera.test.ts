import { describe, expect, it } from "vitest";

import {
  baselineFromExif,
  clampEv,
  defaultSettings,
  getCamera,
  parseAperture,
  parseShutter,
  snapToCamera,
  stepOption,
} from "../src/lib/camera";
import { chunkRows, getStyle, getStyles, orderedStylesForWheel } from "../src/lib/styles";
import { settingsToSimParams } from "../src/lib/simulation";
import type { ExifInfo } from "../src/lib/types";

const canon = getCamera("canon_eos_rebel_sl3")!;
const sony = getCamera("sony_a6400")!;

describe("parsing", () => {
  it("parses shutter values", () => {
    expect(parseShutter("1/250")).toBeCloseTo(0.004, 6);
    expect(parseShutter('30"')).toBe(30);
    expect(parseShutter("1/60")).toBeCloseTo(1 / 60, 6);
    expect(parseShutter("bogus")).toBeNull();
  });

  it("parses aperture values", () => {
    expect(parseAperture("f/2.8")).toBeCloseTo(2.8, 5);
    expect(parseAperture("f/16")).toBe(16);
  });
});

describe("baseline + clamping", () => {
  it("uses EXIF when present", () => {
    const exif = {
      has_exif: true,
      iso: 800,
      shutter_speed: "1/250",
      aperture: "f/2.8",
    } as ExifInfo;
    const b = baselineFromExif(canon, exif);
    expect(b).toEqual({ iso: 800, shutter: 1 / 250, aperture: 2.8 });
  });

  it("falls back to camera defaults without EXIF", () => {
    const b = baselineFromExif(canon, null);
    expect(b.iso).toBe(100);
    expect(b.shutter).toBeCloseTo(1 / 125, 6);
  });

  it("clamps EV to the model's range (Canon ±2, Sony ±5)", () => {
    expect(clampEv(canon, 9)).toBe(2);
    expect(clampEv(sony, 9)).toBe(5);
    expect(clampEv(canon, -9)).toBe(-2);
  });

  it("snaps recommended ISO to supported stops", () => {
    const out = snapToCamera(canon, { iso: "333" });
    expect(["3200", "400"]).toContain(out.iso);
  });
});

describe("snapToCamera (recipes + recommendations)", () => {
  it("snaps unsupported apertures to the nearest stop", () => {
    // bodies carry the full f/1.4-f/22 mount ladder, so f/1.0 (below any real lens) snaps up
    expect(snapToCamera(canon, { aperture: "f/1.0" }).aperture).toBe("f/1.4");
    expect(snapToCamera(sony, { aperture: "f/1.0" }).aperture).toBe("f/1.4");
  });

  it("snaps shutters and keeps supported values verbatim", () => {
    expect(snapToCamera(canon, { shutter_speed: "1/350" }).shutter_speed).toBe("1/500");
    expect(snapToCamera(canon, { shutter_speed: '8"' }).shutter_speed).toBe('8"');
    expect(snapToCamera(canon, { iso: "800" }).iso).toBe("800");
  });

  it("clamps EV ranges and drops unknown settings", () => {
    expect(snapToCamera(canon, { exposure_comp: 9 }).exposure_comp).toBe(2);
    expect(snapToCamera(canon, { not_a_setting: "x" }).not_a_setting).toBeUndefined();
  });
});

describe("photography styles", () => {
  it("ships six styles with recipes and drills", () => {
    expect(getStyles().map((s) => s.id)).toEqual(
      expect.arrayContaining(["portrait", "landscape", "macro", "wildlife", "sports", "astrophotography", "street", "fine_art", "event", "architecture"]),
    );
    for (const style of getStyles()) {
      expect(style.recipe.settings).toBeTruthy();
      expect(style.exercises?.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("portrait recipe applies exactly — prime apertures are on every body's ladder", () => {
    const recipe = getStyle("portrait")!.recipe.settings;
    expect(snapToCamera(canon, recipe).aperture).toBe("f/2.0");
    expect(snapToCamera(sony, recipe).aperture).toBe("f/2.0");
  });

  it("style wheel leads with the headline genres and chunks into rows of five", () => {
    const ordered = orderedStylesForWheel(getStyles());
    expect(ordered.slice(0, 5).map((s) => s.id)).toEqual(["portrait", "wildlife", "sports", "landscape", "wedding"]);
    expect(ordered).toHaveLength(getStyles().length); // nothing dropped, nothing duplicated
    const rows = chunkRows(ordered, 5);
    expect(rows[0].map((s) => s.id)).toEqual(["portrait", "wildlife", "sports", "landscape", "wedding"]);
    expect(rows.every((r) => r.length > 0 && r.length <= 5)).toBe(true);
    expect(rows.length).toBe(Math.ceil(getStyles().length / 5));
  });

  it("night recipe resolves on the Nikon", () => {
    const astro = getStyle("astrophotography")!.recipe.settings;
    const applied = snapToCamera(getCamera("nikon_z50")!, astro);
    expect(applied.shutter_speed).toBe('8"');
    expect(applied.iso).toBe("1600");
  });
});

describe("stepping through options", () => {
  it("moves along shutter stops", () => {
    expect(stepOption(canon, "shutter_speed", "1/125", 1)).toBe("1/250");
    expect(stepOption(canon, "shutter_speed", "1/125", -1)).toBe("1/60");
  });

  it("clamps at list ends", () => {
    expect(stepOption(canon, "shutter_speed", '30"', -1)).toBe('30"');
    expect(stepOption(canon, "shutter_speed", "1/4000", 1)).toBe("1/4000");
  });
});

describe("simulation mapping", () => {
  const baseline = { iso: 100, shutter: 1 / 125, aperture: 4 };

  const params = (settings: Record<string, string | number>) =>
    settingsToSimParams(canon, { ...defaultSettings(canon), ...settings }, baseline);

  it("ISO 100 → 200 doubles brightness", () => {
    expect(params({ iso: "200" }).gain).toBeCloseTo(2, 3);
  });

  it("stopping down f/4 → f/8 quarters brightness and adds no blur", () => {
    const p = params({ aperture: "f/8.0" });
    expect(p.gain).toBeCloseTo(0.25, 3);
    expect(p.dofBlurPx).toBe(0);
  });

  it("opening up f/4 → f/2.8 adds depth-of-field blur", () => {
    expect(params({ aperture: "f/2.8" }).dofBlurPx).toBeGreaterThan(0);
  });

  it("noise grows with ISO", () => {
    expect(params({ iso: "3200" }).noise).toBeGreaterThan(params({ iso: "400" }).noise);
    expect(params({ iso: "100" }).noise).toBe(0);
  });

  it("slow shutter adds motion smear, fast does not", () => {
    expect(params({ shutter_speed: '1"' }).motionPx).toBeGreaterThan(0);
    expect(params({ shutter_speed: "1/250" }).motionPx).toBe(0);
  });

  it("white balance presets shift temperature; kelvin maps warmer when higher", () => {
    expect(params({ white_balance: "tungsten" }).tempShift).toBeLessThan(0);
    expect(params({ white_balance: "shade" }).tempShift).toBeGreaterThan(0);
    const cool = params({ white_balance: "kelvin", wb_kelvin: 3000 });
    const warm = params({ white_balance: "kelvin", wb_kelvin: 8000 });
    expect(warm.tempShift).toBeGreaterThan(cool.tempShift);
  });

  it("monochrome style desaturates", () => {
    expect(params({ picture_style: "monochrome" }).saturation).toBe(0);
    expect(params({ picture_style: "monochrome" }).mono).toBe(true);
  });

  it("exposure comp adds EV on top of the triangle", () => {
    expect(params({ exposure_comp: 1 }).gain).toBeCloseTo(2, 3);
    expect(params({ exposure_comp: -1 }).gain).toBeCloseTo(0.5, 3);
  });
});
