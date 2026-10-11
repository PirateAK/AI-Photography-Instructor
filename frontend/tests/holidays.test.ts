import { describe, expect, it } from "vitest";
import {
  CHALLENGE_SHOTS_TO_COMPLETE,
  activeHolidayWindow,
  challengeAfterShot,
  contestSchedule,
  easterSunday,
  holidayDate,
  holidayWindows,
  nthWeekday,
} from "../src/lib/holidays";
import { HOLIDAYS } from "../src/lib/holidays";

const byId = (id: string) => HOLIDAYS.find((h) => h.id === id)!;

const D = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

describe("date rules", () => {
  it("computes fixed dates", () => {
    expect(holidayDate({ type: "fixed", month: 10, day: 31 }, 2026)).toEqual(D("2026-10-31"));
    expect(holidayDate({ type: "fixed", month: 1, day: 1 }, 2027)).toEqual(D("2027-01-01"));
  });

  it("computes nth-weekday dates (Thanksgiving 4th Thu Nov, Mother's Day 2nd Sun May)", () => {
    expect(holidayDate({ type: "nth_weekday", month: 11, nth: 4, weekday: 4 }, 2026)).toEqual(D("2026-11-26"));
    expect(holidayDate({ type: "nth_weekday", month: 5, nth: 2, weekday: 0 }, 2027)).toEqual(D("2027-05-09"));
    expect(nthWeekday(2026, 11, 4, 4)!.getDay()).toBe(4);
  });

  it("computes Easter via computus", () => {
    expect(easterSunday(2026)).toEqual(D("2026-04-05"));
    expect(easterSunday(2027)).toEqual(D("2027-03-28"));
  });
});

describe("activeHolidayWindow", () => {
  it("opens the window a week before the holiday", () => {
    expect(activeHolidayWindow(D("2026-10-24"))?.holiday.id).toBe("halloween");
    expect(activeHolidayWindow(D("2026-10-23"))).toBeNull();
  });

  it("stays active through the holiday and the day after, then reverts", () => {
    expect(activeHolidayWindow(D("2026-10-31"))?.holiday.id).toBe("halloween");
    expect(activeHolidayWindow(D("2026-11-01"))?.holiday.id).toBe("halloween");
    expect(activeHolidayWindow(D("2026-11-02"))).toBeNull();
  });

  it("covers a year-crossing window (New Year opens Dec 25)", () => {
    expect(activeHolidayWindow(D("2026-12-28"))?.holiday.id).toBe("new_year");
    expect(activeHolidayWindow(D("2027-01-01"))?.holiday.id).toBe("new_year");
    expect(activeHolidayWindow(D("2027-01-02"))?.holiday.id).toBe("new_year");
    expect(activeHolidayWindow(D("2027-01-03"))).toBeNull();
  });

  it("on the holiday date itself, that holiday wins over an overlapping window", () => {
    // Christmas window Dec 18–26 overlaps New Year window Dec 25–Jan 2.
    expect(activeHolidayWindow(D("2026-12-25"))?.holiday.id).toBe("christmas");
    expect(activeHolidayWindow(D("2026-12-26"))?.holiday.id).toBe("new_year");
    expect(activeHolidayWindow(D("2026-12-24"))?.holiday.id).toBe("christmas");
  });

  it("resolves floating holidays inside their windows", () => {
    expect(activeHolidayWindow(D("2026-11-20"))?.holiday.id).toBe("thanksgiving");
    expect(activeHolidayWindow(D("2026-11-26"))?.holiday.id).toBe("thanksgiving");
    expect(activeHolidayWindow(D("2026-11-27"))?.holiday.id).toBe("thanksgiving");
    expect(activeHolidayWindow(D("2026-11-28"))).toBeNull();
  });

  it("finds Easter and Mother's Day 2027 windows", () => {
    expect(activeHolidayWindow(D("2027-03-25"))?.holiday.id).toBe("easter");
    expect(activeHolidayWindow(D("2027-05-05"))?.holiday.id).toBe("mothers_day");
  });

  it("is quiet between holidays", () => {
    expect(holidayWindows(D("2026-11-10"))).toEqual([]);
    expect(holidayWindows(D("2027-06-10"))).toEqual([]);
  });
});

describe("contestSchedule", () => {
  it("never treats last year's contest as live (regression: 'results are in' in October)", () => {
    // Oct 11, 2026: Halloween 2025's gallery reset long ago — 2026 is merely upcoming.
    expect(contestSchedule(byId("halloween"), D("2026-10-11")).phase).toBe("upcoming");
    expect(contestSchedule(byId("halloween"), D("2026-10-11")).holidayDate).toEqual(D("2026-10-31"));
  });

  it("walks the full cycle: submitting → voting → results → upcoming", () => {
    expect(contestSchedule(byId("halloween"), D("2026-10-28")).phase).toBe("submitting");
    expect(contestSchedule(byId("halloween"), D("2026-11-04")).phase).toBe("voting");
    expect(contestSchedule(byId("halloween"), D("2026-11-12")).phase).toBe("results");
    // Thanksgiving window opened Nov 19 — Halloween's gallery has reset
    expect(contestSchedule(byId("halloween"), D("2026-11-20")).phase).toBe("upcoming");
  });

  it("keeps results live through the gap until the next window opens", () => {
    // Nov 9–18: Halloween results, Thanksgiving not started yet
    expect(contestSchedule(byId("thanksgiving"), D("2026-11-12")).phase).toBe("upcoming");
    expect(contestSchedule(byId("halloween"), D("2026-11-18")).phase).toBe("results");
    expect(contestSchedule(byId("thanksgiving"), D("2026-11-19")).phase).toBe("submitting");
  });
});

describe("challengeAfterShot", () => {
  it("counts shots and auto-completes at 3", () => {
    expect(CHALLENGE_SHOTS_TO_COMPLETE).toBe(3);
    let shots: Record<string, number> = {};
    let completed: string[] = [];

    let r = challengeAfterShot(shots, completed, "halloween");
    expect(r.shots["halloween"]).toBe(1);
    expect(r.justCompleted).toBe(false);
    shots = r.shots;

    r = challengeAfterShot(shots, completed, "halloween");
    expect(r.shots["halloween"]).toBe(2);
    shots = r.shots;

    r = challengeAfterShot(shots, completed, "halloween");
    expect(r.shots["halloween"]).toBe(3);
    expect(r.completed).toEqual(["halloween"]);
    expect(r.justCompleted).toBe(true);
  });

  it("never double-completes", () => {
    const r = challengeAfterShot({ halloween: 3 }, ["halloween"], "halloween");
    expect(r.completed).toEqual(["halloween"]);
    expect(r.justCompleted).toBe(false);
  });
});
