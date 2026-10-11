/* 🎄 Holiday system — seasonal banners + photo challenges.
 * Windows: 7 days before the holiday through 1 day after ("the week before, ending the day after").
 * Overlap rule: on the holiday date itself that holiday wins; otherwise the window
 * that started most recently wins (so Christmas yields to New Year on Dec 26).
 * Floating dates (Thanksgiving, Mother's Day) use nth-weekday rules; Easter uses computus,
 * so the calendar never needs manual maintenance.
 */
import holidaysJson from "../../../data/holidays.json";

export interface HolidayDrilldown {
  id: string;
  label: string;
  prompt: string;
}

export interface HolidayChallenge {
  title: string;
  goal: string;
}

export interface HolidayConfig {
  id: string;
  name: string;
  emoji: string;
  rule:
    | { type: "fixed"; month: number; day: number }
    | { type: "nth_weekday"; month: number; nth: number; weekday: number } // weekday: 0=Sun
    | { type: "easter" };
  banner: string;
  style_id?: string;
  greeting: string;
  tips: string[];
  challenge: HolidayChallenge;
  drilldowns: HolidayDrilldown[];
}

export interface HolidayWindow {
  holiday: HolidayConfig;
  holidayDate: Date;
  windowStart: Date;
  windowEnd: Date;
}

const CONFIG = holidaysJson as {
  window_start_days: number;
  window_end_days: number;
  shots_to_complete: number;
  holidays: HolidayConfig[];
};

export const HOLIDAYS: HolidayConfig[] = CONFIG.holidays;
export const HOLIDAY_WINDOW_START_DAYS = CONFIG.window_start_days;
export const HOLIDAY_WINDOW_END_DAYS = CONFIG.window_end_days;
export const CHALLENGE_SHOTS_TO_COMPLETE = CONFIG.shots_to_complete;

export function holidayById(id: string | null | undefined): HolidayConfig | null {
  if (!id) return null;
  return HOLIDAYS.find((h) => h.id === id) ?? null;
}

/** Test/demo hook: `?holiday=YYYY-MM-DD` in the URL previews any season on demand.
 * Harmless in normal use — with no param this is just `new Date()`. */
export function effectiveNow(): Date {
  try {
    const raw = new URLSearchParams(window.location.search).get("holiday");
    if (raw) {
      const d = new Date(`${raw}T12:00:00`);
      if (!isNaN(d.getTime())) return d;
    }
  } catch {
    /* no window (tests / SSR) — fall through */
  }
  return new Date();
}

/** Anonymous Gregorian algorithm — Easter Sunday for a given year. */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/** The nth weekday of a month (e.g. 4th Thursday of November). Returns null if it doesn't exist. */
export function nthWeekday(year: number, month: number, nth: number, weekday: number): Date | null {
  const first = new Date(year, month - 1, 1);
  const shift = (weekday - first.getDay() + 7) % 7;
  const day = 1 + shift + (nth - 1) * 7;
  const probe = new Date(year, month - 1, day);
  return probe.getMonth() === month - 1 ? probe : null;
}

export function holidayDate(rule: HolidayConfig["rule"], year: number): Date | null {
  switch (rule.type) {
    case "fixed":
      return new Date(year, rule.month - 1, rule.day);
    case "nth_weekday":
      return nthWeekday(year, rule.month, rule.nth, rule.weekday);
    case "easter":
      return easterSunday(year);
  }
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

/** All windows that contain `now` (checks current + next year to cover year-crossing windows). */
export function holidayWindows(now: Date = effectiveNow()): HolidayWindow[] {
  const out: HolidayWindow[] = [];
  for (const year of [now.getFullYear(), now.getFullYear() + 1]) {
    for (const holiday of HOLIDAYS) {
      const date = holidayDate(holiday.rule, year);
      if (!date) continue;
      const windowStart = addDays(date, -HOLIDAY_WINDOW_START_DAYS);
      const windowEnd = addDays(date, HOLIDAY_WINDOW_END_DAYS);
      const now0 = startOfDay(now);
      if (now0 >= startOfDay(windowStart) && now0 <= startOfDay(windowEnd)) {
        out.push({ holiday, holidayDate: date, windowStart, windowEnd });
      }
    }
  }
  return out;
}

/** The one holiday whose banner should show right now, if any. */
export function activeHolidayWindow(now: Date = effectiveNow()): HolidayWindow | null {
  const windows = holidayWindows(now);
  if (windows.length === 0) return null;
  const now0 = startOfDay(now);
  // On the holiday itself, that holiday takes the banner.
  const today = windows.find((w) => startOfDay(w.holidayDate).getTime() === now0.getTime());
  if (today) return today;
  // Otherwise the window that started most recently wins.
  return windows.reduce((a, b) => (b.windowStart > a.windowStart ? b : a));
}

export function activeHoliday(now: Date = new Date()): HolidayConfig | null {
  return activeHolidayWindow(now)?.holiday ?? null;
}

/** Pure reducer: state after one more challenge shot has been analyzed. */
export function challengeAfterShot(
  shots: Record<string, number>,
  completed: string[],
  id: string,
): { shots: Record<string, number>; completed: string[]; justCompleted: boolean } {
  const nextShots = { ...shots, [id]: (shots[id] ?? 0) + 1 };
  const count = nextShots[id];
  if (count >= CHALLENGE_SHOTS_TO_COMPLETE && !completed.includes(id)) {
    return { shots: nextShots, completed: [...completed, id], justCompleted: true };
  }
  return { shots: nextShots, completed, justCompleted: false };
}

// ---------------------------------------------------------------- contest
// Contest schedule: entries during the holiday window, voting for 7 days after
// it closes, results until the next holiday window opens. Keep the 7 in sync
// with backend/challenges.py VOTING_DAYS.
export const CHALLENGE_VOTING_DAYS = 7;

export type ContestPhase = "upcoming" | "submitting" | "voting" | "results";

export interface ContestSchedule {
  holiday: HolidayConfig;
  holidayDate: Date;
  windowStart: Date;
  windowEnd: Date;
  voteEnd: Date;
  phase: ContestPhase;
}

/** First holiday-window start (any holiday) strictly after `t`. */
function nextWindowStartAfter(t: Date): Date | null {
  const starts: number[] = [];
  for (const h of HOLIDAYS) {
    for (const year of [t.getFullYear(), t.getFullYear() + 1]) {
      const d = holidayDate(h.rule, year);
      if (!d) continue;
      const start = addDays(d, -HOLIDAY_WINDOW_START_DAYS).getTime();
      if (start > t.getTime()) starts.push(start);
    }
  }
  return starts.length ? new Date(Math.min(...starts)) : null;
}

export function contestSchedule(holiday: HolidayConfig, now: Date = effectiveNow()): ContestSchedule {
  const candidates: ContestSchedule[] = [];
  for (const year of [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]) {
    const date = holidayDate(holiday.rule, year);
    if (!date) continue;
    const windowStart = addDays(date, -HOLIDAY_WINDOW_START_DAYS);
    const windowEnd = addDays(date, HOLIDAY_WINDOW_END_DAYS);
    candidates.push({
      holiday,
      holidayDate: date,
      windowStart,
      windowEnd,
      voteEnd: addDays(windowEnd, CHALLENGE_VOTING_DAYS),
      phase: "upcoming",
    });
  }
  if (candidates.length === 0) throw new Error(`No schedule for ${holiday.id}`);

  // The live cycle is the most recent occurrence whose gallery hasn't reset yet
  // (a finished gallery lives until the NEXT holiday window opens) — never a
  // stale one from a previous season.
  const past = candidates.filter((c) => c.windowStart <= now);
  if (past.length > 0) {
    const chosen = past.reduce((a, b) => (b.windowStart > a.windowStart ? b : a));
    const galleryEnd = nextWindowStartAfter(chosen.windowEnd);
    if (!galleryEnd || now < galleryEnd) {
      if (now <= chosen.windowEnd) chosen.phase = "submitting";
      else if (now <= chosen.voteEnd) chosen.phase = "voting";
      else chosen.phase = "results";
      return chosen;
    }
  }
  const future = candidates.filter((c) => c.windowStart > now);
  const upcoming = future.length
    ? future.reduce((a, b) => (b.windowStart < a.windowStart ? b : a))
    : candidates[candidates.length - 1];
  upcoming.phase = "upcoming";
  return upcoming;
}

/** When the next holiday window opens — the finished challenge's gallery resets then. */
export function contestGalleryResetsAt(now: Date = effectiveNow()): Date | null {
  const starts: number[] = [];
  for (const h of HOLIDAYS) {
    for (const year of [now.getFullYear(), now.getFullYear() + 1]) {
      const d = holidayDate(h.rule, year);
      if (!d) continue;
      const start = addDays(d, -HOLIDAY_WINDOW_START_DAYS);
      if (start > now) starts.push(start.getTime());
    }
  }
  return starts.length ? new Date(Math.min(...starts)) : null;
}
