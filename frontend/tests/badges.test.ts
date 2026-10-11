import { describe, expect, it } from "vitest";

import { classBadges, masteryBadges, challengeBadges, earnedBadgeCount } from "../src/lib/badges";
import { buildAppShareMessage, buildShareMessage } from "../src/lib/share";

describe("buildAppShareMessage", () => {
  it("invites a friend and carries the app link", () => {
    const msg = buildAppShareMessage();
    expect(msg).toContain("AI Photography Instructor");
    expect(msg).toContain("Photo Coach");
    expect(msg).toContain("https://");
  });
});
import { courses } from "../src/lib/training";

const beginner = courses.find((c) => c.id === "beginner-class")!;

describe("class badges", () => {
  it("are earned only when every lesson of the course is completed", () => {
    const all = classBadges(courses, beginner.lessons.map((l) => l.id));
    const badge = all.find((b) => b.id === "class-beginner-class")!;
    expect(badge.earned).toBe(true);
    expect(badge.emoji).toBe(beginner.cover_emoji);
    // one lesson short → not earned
    const almost = classBadges(courses, beginner.lessons.slice(1).map((l) => l.id));
    expect(almost.find((b) => b.id === "class-beginner-class")!.earned).toBe(false);
  });

  it("cover the whole catalog with the app's own sigils", () => {
    const all = classBadges(courses, []);
    expect(all).toHaveLength(courses.length);
    expect(all.every((b) => b.emoji.length > 0)).toBe(true);
    expect(all.every((b) => !b.earned)).toBe(true);
  });
});

describe("mastery badges", () => {
  const styles = [
    { id: "food", emoji: "🍽️", label: "Food" },
    { id: "portrait", emoji: "👤", label: "Portrait" },
  ] as never[];

  it("are earned on a perfect 100 with that style selected", () => {
    const sessions = [{ score: 100, style_id: "food" }];
    const badges = masteryBadges(styles, sessions);
    expect(badges.find((b) => b.id === "mastery-food")!.earned).toBe(true);
    expect(badges.find((b) => b.id === "mastery-portrait")!.earned).toBe(false);
  });

  it("near-perfect scores don't earn the mastery badge", () => {
    const badges = masteryBadges(styles, [{ score: 99, style_id: "food" }]);
    expect(badges.find((b) => b.id === "mastery-food")!.earned).toBe(false);
  });
});

describe("challenge badges", () => {
  it("are earned per completed holiday challenge", () => {
    const badges = challengeBadges(["halloween"]);
    expect(badges.length).toBeGreaterThanOrEqual(8); // full 2026-27 calendar
    expect(badges.find((b) => b.id === "challenge-halloween")!.earned).toBe(true);
    expect(badges.find((b) => b.id === "challenge-christmas")!.earned).toBe(false);
    expect(badges.every((b) => b.kind === "challenge")).toBe(true);
    expect(badges.find((b) => b.id === "challenge-halloween")!.requirement).toContain("3 shots");
  });

  it("count toward the earned total", () => {
    const all = [...classBadges(courses, []), ...challengeBadges(["halloween", "christmas"])];
    expect(earnedBadgeCount(all)).toBe(2);
  });
});

describe("earnedBadgeCount", () => {
  it("counts earned badges", () => {
    const badges = [
      { earned: true },
      { earned: false },
      { earned: true },
    ] as never[];
    expect(earnedBadgeCount(badges)).toBe(2);
  });
});

describe("buildShareMessage", () => {
  it("includes the score, the lens and the app link", () => {
    const msg = buildShareMessage({ score: 91, style_id: "food", styleLabel: "Food" });
    expect(msg).toContain("91/100");
    expect(msg).toContain("Food lens");
    expect(msg).toContain("https://");
  });

  it("works without a style", () => {
    const msg = buildShareMessage({ score: 88, style_id: "" });
    expect(msg).toContain("88/100");
    expect(msg).not.toContain("lens");
  });
});
