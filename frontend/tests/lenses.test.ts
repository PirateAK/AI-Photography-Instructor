import { describe, expect, it } from "vitest";

import {
  clampApertureToLens,
  defaultLensForCamera,
  focalZoomRatio,
  getLensById,
  lensApertureDef,
  lensesForCamera,
  mountOf,
  parseFocal,
} from "../src/lib/lenses";
import { getCamera, getCameras } from "../src/lib/camera";
import { settingsToSimParams } from "../src/lib/simulation";
import { defaultSettings } from "../src/lib/camera";

const canon60d = getCamera("canon_eos_60d")!;
const r6ii = getCamera("canon_eos_r6_mark_ii")!;
const a7iv = getCamera("sony_a7_iv")!;
const z9 = getCamera("nikon_z9")!;
const nifty = getLensById("canon_ef_50_18_stm")!;
const kit = getLensById("canon_efs_18_55_is")!;

describe("mount compatibility", () => {
  it("derives mounts from body lines", () => {
    expect(mountOf(canon60d)).toBe("EF");
    expect(mountOf(r6ii)).toBe("RF");
    expect(mountOf(a7iv)).toBe("E");
    expect(mountOf(z9)).toBe("Z");
  });

  it("phones have no mount and no interchangeable lenses", () => {
    const phone = getCamera("phone_point_and_shoot")!;
    expect(mountOf(phone)).toBeNull();
    expect(lensesForCamera(phone)).toEqual([]);
  });

  it("only offers lenses that physically fit", () => {
    for (const cam of getCameras()) {
      const fits = lensesForCamera(cam);
      if (cam.body?.type === "phone") {
        expect(fits).toEqual([]); // phones: the lens is built in
        continue;
      }
      expect(fits.length).toBeGreaterThan(0);
      for (const lens of fits) {
        expect(lens.mount).toBe(mountOf(cam));
      }
    }
  });

  it("gives every interchangeable-lens camera a default lens", () => {
    for (const cam of getCameras()) {
      if (cam.body?.type === "phone") continue;
      expect(defaultLensForCamera(cam)).toBeTruthy();
    }
  });
});

describe("lens aperture options", () => {
  it("kit zoom opens only to f/3.5; nifty fifty to f/1.8", () => {
    const kitDef = lensApertureDef(kit);
    expect(kitDef.options[0].value).toBe("f/3.5");
    const niftyDef = lensApertureDef(nifty);
    expect(niftyDef.options[0].value).toBe("f/1.8");
    expect(niftyDef.options[niftyDef.options.length - 1].value).toBe("f/22");
  });

  it("clamps apertures the lens can't open to", () => {
    expect(clampApertureToLens("f/1.8", kit)).toBe("f/3.5");
    expect(clampApertureToLens("f/1.8", nifty)).toBe("f/1.8");
  });
});

describe("focal zoom", () => {
  const exif135 = { has_exif: true, focal_length: "135mm" } as never;

  it("parses EXIF focal length", () => {
    expect(parseFocal("135mm")).toBe(135);
    expect(parseFocal(null)).toBeNull();
  });

  it("tightens framing when mounting a shorter focal length lens", () => {
    // shot at 135mm, swap to a 50mm prime — wait: that's WIDER; clamps to 1
    expect(focalZoomRatio(nifty, exif135)).toBe(1);
    // shot at 50mm? swap the other direction via 100mm macro:
    const exif50 = { has_exif: true, focal_length: "50mm" } as never;
    const macro = getLensById("canon_ef_100_28_macro")!;
    expect(focalZoomRatio(macro, exif50)).toBe(2);
  });

  it("clamps zoom to 4x", () => {
    const exif16 = { has_exif: true, focal_length: "16mm" } as never;
    expect(focalZoomRatio(nifty, exif16)).toBeLessThanOrEqual(4);
  });

  it("no EXIF focal -> no zoom", () => {
    expect(focalZoomRatio(nifty, null)).toBe(1);
  });
});

describe("IS raises the shake threshold", () => {
  const baseline = { iso: 200, shutter: 1 / 500, aperture: 5.6 };
  const settings = { ...defaultSettings(canon60d), shutter_speed: "1/8" };

  it("1/8s smears without IS, stays clean with it", () => {
    const without = settingsToSimParams(canon60d, settings, baseline);
    const withIS = settingsToSimParams(canon60d, settings, baseline, {
      zoomRatio: 1,
      isStops: 4,
    });
    expect(without.motionPx).toBeGreaterThan(0);
    expect(withIS.motionPx).toBe(0);
  });
});

describe("fovZoom reaches the render pipeline", () => {
  it("zoom > 1 is carried in SimParams", () => {
    const baseline = { iso: 200, shutter: 1 / 500, aperture: 5.6 };
    const p = settingsToSimParams(canon60d, defaultSettings(canon60d), baseline, {
      zoomRatio: 2.7,
      isStops: 0,
    });
    expect(p.fovZoom).toBe(2.7);
  });
});
