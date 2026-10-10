import { describe, expect, it } from "vitest";

import { buildLessons } from "../src/lib/lessons";
import { defaultSettings, getCamera, snapValue } from "../src/lib/camera";
import { getStyle } from "../src/lib/styles";
import { getCameras } from "../src/lib/camera";
import type { AnalysisResult } from "../src/lib/types";
import type { StyleLesson } from "../src/lib/styles";

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

  it("includes approved style lessons snapped to the camera, hides drafts", () => {
    const styleWithLessons = {
      ...portrait,
      lessons: [
        {
          id: "portrait-1",
          title: "Eyes first",
          description: "Feel the f/1.8 falloff on a face.",
          steps: [
            { settingId: "aperture", value: "f/1.4", narration: "Open wide." },
            { settingId: "aperture", value: "f/99", narration: "Impossible — should snap to the smallest stop." },
            { settingId: "gain", value: "10", narration: "Not a camera setting — dropped." },
          ],
          practice_brief: "Watch the background melt.",
          draft: true,
        },
        {
          id: "portrait-2",
          title: "Approved lesson",
          description: "Visible to learners.",
          steps: [{ settingId: "aperture", value: "f/2.8", narration: "Portrait classic." }],
          draft: false,
        },
      ] as StyleLesson[],
    };
    const lessons = buildLessons(canon, defaultSettings(canon), null, styleWithLessons, null);
    expect(lessons.find((l) => l.id === "style-portrait-portrait-1")).toBeUndefined(); // draft hidden
    const approved = lessons.find((l) => l.id === "style-portrait-portrait-2")!;
    expect(approved).toBeTruthy();
    // f/2.8 isn't on the SL3's option list — assert the value landed on a real stop
    const landed = String(approved.steps[0].value);
    const apDef = canon.settings.aperture;
    const supported = apDef && apDef.type === "discrete" ? apDef.options.map((o) => o.value) : [];
    expect(supported).toContain(landed);
    // draft with impossible values still snaps when approved: f/99 → smallest available stop
    const draftVisible = buildLessons(canon, defaultSettings(canon), null, { ...styleWithLessons, lessons: styleWithLessons.lessons!.map((l) => (l.id === "portrait-1" ? { ...l, draft: false } : l)) }, null);
    const snapped = draftVisible.find((l) => l.id === "style-portrait-portrait-1")!;
    expect(snapped.steps.length).toBe(2); // unknown setting dropped
    expect(snapped.steps[1].value).not.toBe("f/99");
  });
});

describe("snapValue", () => {
  it("passes through exact supported values", () => {
    expect(snapValue(canon, "iso", "400")).toBe("400");
  });

  it("snaps numeric values to the nearest supported stop", () => {
    expect(snapValue(canon, "iso", "500")).toBe("400");
  });

  it("clamps range settings (exposure comp) to the camera's span", () => {
    expect(Math.abs(Number(snapValue(canon, "exposure_comp", 9)))).toBeLessThanOrEqual(3);
  });

  it("returns null for unknown settings and unsupported discrete values", () => {
    expect(snapValue(canon, "gain", "10")).toBeNull();
    expect(snapValue(canon, "white_balance", "tungsten_x")).toBeNull();
  });
});
