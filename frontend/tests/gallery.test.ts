import { describe, expect, it } from "vitest";

import { applyCap, isImageFile, GALLERY_CAP } from "../src/lib/gallery";

describe("gallery cap", () => {
  it("evicts only what exceeds the cap", () => {
    expect(GALLERY_CAP).toBe(100);
    expect(applyCap(0)).toBe(0);
    expect(applyCap(100)).toBe(0);
    expect(applyCap(105)).toBe(5);
    expect(applyCap(1000)).toBe(900);
  });

  it("accepts only image files for the gallery", () => {
    const jpeg = new File(["x"], "a.jpg", { type: "image/jpeg" });
    const png = new File(["x"], "b.png", { type: "image/png" });
    const mov = new File(["x"], "c.mov", { type: "video/quicktime" });
    expect(isImageFile(jpeg)).toBe(true);
    expect(isImageFile(png)).toBe(true);
    expect(isImageFile(mov)).toBe(false);
  });
});
