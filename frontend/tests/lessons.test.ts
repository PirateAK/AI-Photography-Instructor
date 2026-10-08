import { describe, expect, it } from "vitest";

import { buildLessons } from "../src/lib/lessons";
import { defaultSettings, getCamera } from "../src/lib/camera";
import { getStyle } from "../src/lib/styles";
import { getCameras } from "../src/lib/camera";
import type { AnalysisResult } from "../src/lib/types";

const canon = getCamera("canon_eos_rebel_sl3")!;
const portrait = getStyle("portrait")!;

const fakeAnalysis: AnalysisResult = {
  overall_score: 55,
  summary: "test",
  issues: [],
  technical_notes: { exposure: "", white_balance: "", noise: "", sharpness: "" },
  composition_notes: [],
  suggested_fixes: { in_camera: [], in_post: [] },
  recommended_settings: {
    iso: "400",
    shutter_speed: "1/250",
    aperture: "f/5.6",
    white_balance: null,
    exposure_comp: null,
    reasoning: "brighten things up",
  },
  practice_exercises: [],
};

describe("buildLessons", () => {
  it("always offers the exposure-triangle lesson with multiple steps", () => {
    const lessons = buildLessons(canon, defaultSettings(canon), null, undefined, null);
    const triangle = lessons.find((l) => l.id === "triangle")!;
    expect(triangle).toBeTruthy();
    expect(triangle.steps.length).toBeGreaterThanOrEqual(3);
    expect(triangle.steps.every((s) => canon.settings[s.settingId])).toBe(true);
  });

  it("includes a style recipe lesson when a style is selected", () => {
    const lessons = buildLessons(canon, defaultSettings(canon), null, portrait, null);
    const recipe = lessons.find((l) => l.id === "recipe-portrait")!;
    expect(recipe).toBeTruthy();
    // recipe values survive snapping onto this camera's options
    for (const step of recipe.steps) {
      expect(canon.settings[step.settingId]).toBeTruthy();
    }
  });

  it("builds a fix-tour from analysis recommendations, skipping no-op steps", () => {
    const settings = { ...defaultSettings(canon), aperture: "f/5.6", iso: "400", shutter_speed: "1/250" };
    const lessons = buildLessons(canon, settings, null, undefined, fakeAnalysis);
    const tour = lessons.find((l) => l.id === "fix-tour")!;
    // recommendations equal current settings -> no steps at all, lesson dropped
    expect(tour).toBeUndefined();
  });

  it("fix-tour applies steps when recommendations differ from current settings", () => {
    const settings = { ...defaultSettings(canon), aperture: "f/16", iso: "12800", shutter_speed: "1/8" };
    const lessons = buildLessons(canon, settings, null, undefined, fakeAnalysis);
    const tour = lessons.find((l) => l.id === "fix-tour")!;
    expect(tour).toBeTruthy();
    expect(tour!.steps.map((s) => s.settingId)).toContain("iso");
  });

  it("lesson steps reference real settings for every shipped camera", () => {
    for (const cam of getCameras()) {
      const lessons = buildLessons(cam, defaultSettings(cam), null, portrait, fakeAnalysis);
      for (const lesson of lessons) {
        for (const step of lesson.steps) {
          expect(cam.settings[step.settingId], `${cam.id} missing ${step.settingId}`).toBeTruthy();
        }
      }
    }
  });
});
