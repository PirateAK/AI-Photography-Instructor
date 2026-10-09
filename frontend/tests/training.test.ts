import { describe, expect, it } from "vitest";

import {
  appConfig,
  courses,
  embedUrl,
  getCourse,
  isUnlocked,
  isValidCode,
  totalMinutes,
  unlockAllPaid,
} from "../src/lib/training";

describe("training catalog", () => {
  it("ships two free teaser courses and at least one paid course", () => {
    expect(courses.filter((c) => c.price === "free").length).toBe(2);
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
