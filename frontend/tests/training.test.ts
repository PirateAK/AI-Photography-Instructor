import { describe, expect, it } from "vitest";

import {
  appConfig,
  canManageContent,
  courses,
  embedUrl,
  getCourse,
  isUnlocked,
  isValidCode,
  isInstructorCode,
  totalMinutes,
  unlockAllPaid,
} from "../src/lib/training";

describe("training catalog", () => {
  it("ships free teaser courses and at least one paid course", () => {
    expect(courses.filter((c) => c.price === "free").length).toBe(4);
    expect(courses.filter((c) => c.price === "paid").length).toBeGreaterThanOrEqual(1);
  });

  it("every lesson has video, summary and duration", () => {
    for (const course of courses) {
      for (const lesson of course.lessons) {
        expect(lesson.video_url).toMatch(/^https?:\/\//);
        expect(lesson.summary.length).toBeGreaterThan(10);
        expect(lesson.duration_min).toBeGreaterThan(0);
      }
    }
  });

  it("computes totals", () => {
    const course = courses[0];
    expect(totalMinutes(course)).toBe(course.lessons.reduce((s, l) => s + l.duration_min, 0));
    expect(getCourse(course.id)).toBe(course);
  });
});

describe("unlocks", () => {
  it("free courses are always unlocked; paid require purchase", () => {
    const free = courses.find((c) => c.price === "free")!;
    const paid = courses.find((c) => c.price === "paid")!;
    expect(isUnlocked(free, [])).toBe(true);
    expect(isUnlocked(paid, [])).toBe(false);
    expect(isUnlocked(paid, [paid.id])).toBe(true);
  });

  it("valid redemption codes unlock all paid courses; junk does not", () => {
    expect(appConfig.redemption_codes.length).toBeGreaterThan(0);
    expect(isValidCode(appConfig.redemption_codes[0])).toBe(true);
    expect(isValidCode("nope")).toBe(false);
    expect(unlockAllPaid().length).toBe(courses.filter((c) => c.price === "paid").length);
  });

  it("instructor codes gate the dashboard (case/space tolerant)", () => {
    expect((appConfig.instructor_codes ?? []).length).toBeGreaterThan(0);
    const code = appConfig.instructor_codes![0];
    expect(isInstructorCode(`  ${code.toLowerCase()} `)).toBe(true);
    expect(isInstructorCode("nope")).toBe(false);
    // codes must not collide with redemption codes
    for (const ic of appConfig.instructor_codes ?? []) {
      expect(appConfig.redemption_codes.map((c) => c.toUpperCase())).not.toContain(ic.toUpperCase());
    }
  });

  it("content management is gated: instructor unlock now, Pro/credit later via the same gate", () => {
    expect(canManageContent({ instructorUnlocked: false })).toBe(false);
    expect(canManageContent({ instructorUnlocked: true })).toBe(true);
  });
});

describe("video embeds", () => {
  it("maps youtube variants", () => {
    expect(embedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    );
    expect(embedUrl("https://youtu.be/dQw4w9WgXcQ")).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
    expect(embedUrl("https://www.youtube.com/shorts/dQw4w9WgXc")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXc",
    );
  });

  it("maps vimeo and leaves mp4 direct", () => {
    expect(embedUrl("https://vimeo.com/123456789")).toBe("https://player.vimeo.com/video/123456789");
    expect(embedUrl("https://cdn.example.com/lesson.mp4")).toBeNull();
  });
});

describe("curriculum categories", () => {
  it("groups every course into one of the four categories", () => {
    const cats = new Set(courses.map((c) => c.category));
    expect(cats).toEqual(new Set(["Fundamentals", "Genre-specific", "Advanced", "Specialized"]));
  });

  it("fundamentals include the free intro course", () => {
    const intro = courses.find((c) => c.id === "intro-digital-photography")!;
    expect(intro.category).toBe("Fundamentals");
    expect(intro.price).toBe("free");
    expect(intro.lessons.length).toBeGreaterThanOrEqual(4);
  });

  it("exposure triangle course teaches the priority-first arc", () => {
    const et = courses.find((c) => c.id === "free-exposure-triangle")!;
    // the four authored classes lead, followed by the three fun classes; the triangle follows them
    expect(courses[0].id).toBe("beginner-class");
    expect(courses[1].id).toBe("intermediate-class");
    expect(courses[2].id).toBe("advanced-class");
    expect(courses[3].id).toBe("pro-class");
    expect(courses.findIndex((c) => c.id === "free-exposure-triangle")).toBeLessThan(8);
    expect(et.lessons.length).toBe(7);
    const titles = et.lessons.map((l) => l.title).join(" | ");
    expect(titles).toContain("Pick your priority first");
    expect(titles).toContain("slice of time");
    // the f-stop numbering trap is taught: f-stops count how far CLOSED the aperture is
    expect(et.lessons.some((l) => l.summary.includes("how far the aperture is CLOSED"))).toBe(true);
    // focus does not guarantee sharpness — depth of field does
    expect(et.lessons.some((l) => l.summary.includes("outside the depth of field"))).toBe(true);
    // every lesson ends in a simulator drill
    for (const l of et.lessons) {
      expect(l.practice_preset).toBeDefined();
      expect(Object.keys(l.practice_preset!).length).toBeGreaterThanOrEqual(3);
      expect(l.practice_brief!.length).toBeGreaterThan(20);
    }
  });

  it("post-processing lessons teach editing, not camera settings", () => {
    const pp = courses.find((c) => c.id === "post-processing-course")!;
    expect(pp.category).toBe("Advanced");
    for (const lesson of pp.lessons) expect(lesson.practice_preset).toBeUndefined();
  });
});
