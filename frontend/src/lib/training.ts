// Training classes catalog + unlock logic (data/training_courses.json,
// data/app_config.json). Redemption codes are a client-side MVP stub —
// replace with server validation before real sales.
import coursesJson from "../../../data/training_courses.json";
import configJson from "../../../data/app_config.json";

export interface Lesson {
  id: string;
  title: string;
  duration_min: number;
  summary: string;
  video_url: string;
  video_kind: "mp4" | "youtube" | "vimeo";
  difficulty?: "Beginner" | "Intermediate" | "Advanced";
  practice_preset?: Record<string, string | number>;
  practice_brief?: string;
}

export interface TrainingCourse {
  id: string;
  category: string;
  title: string;
  cover_emoji: string;
  tagline: string;
  description: string;
  level: string;
  author?: string;
  price: "free" | "paid";
  lessons: Lesson[];
}

export interface AppConfig {
  store_url: string;
  store_label: string;
  redemption_codes: string[];
  instructor_codes?: string[];
}

export const appConfig = configJson as unknown as AppConfig;
export const courses = (coursesJson as unknown as { version: number; courses: TrainingCourse[] }).courses;

export function getCourse(id: string): TrainingCourse | undefined {
  return courses.find((c) => c.id === id);
}

export function totalMinutes(course: TrainingCourse): number {
  return course.lessons.reduce((sum, l) => sum + l.duration_min, 0);
}

export const CATEGORY_ORDER = ["Fundamentals", "Genre-specific", "Advanced", "Specialized"];

/** Courses grouped by category in curriculum order. */
export function coursesByCategory(all: TrainingCourse[]): { category: string; courses: TrainingCourse[] }[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    courses: all.filter((c) => c.category === category),
  })).filter((g) => g.courses.length > 0);
}

/** Difficulty shown on a lesson row: the lesson's own, else the course level. */
export function lessonDifficulty(
  course: TrainingCourse,
  lesson: Lesson,
): "Beginner" | "Intermediate" | "Advanced" {
  if (lesson.difficulty) return lesson.difficulty;
  if (course.level.startsWith("Advanced")) return "Advanced";
  if (course.level.startsWith("Intermediate")) return "Intermediate";
  return "Beginner";
}

/** Course progress against the learner's completed-lesson list. */
export function courseProgress(
  course: TrainingCourse,
  completedIds: string[],
): { done: number; total: number; pct: number } {
  const total = course.lessons.length;
  const done = course.lessons.filter((l) => completedIds.includes(l.id)).length;
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
}

export function isUnlocked(course: TrainingCourse, unlockedIds: string[]): boolean {
  return course.price === "free" || unlockedIds.includes(course.id);
}

export function unlockAllPaid(): string[] {
  return courses.filter((c) => c.price === "paid").map((c) => c.id);
}

export function isValidCode(code: string): boolean {
  const normalized = code.trim().toUpperCase();
  return appConfig.redemption_codes.some((c) => c.toUpperCase() === normalized);
}

/**
 * Instructor codes unlock the hidden Instructor Dashboard (typed into the
 * "What do you want to learn or shoot?" field on the home screen). Codes live
 * in app_config.json — a client-side gate for solo/ship use, same trust level
 * as the redemption codes.
 */
export function isInstructorCode(code: string): boolean {
  const normalized = code.trim().toUpperCase();
  return (appConfig.instructor_codes ?? []).some((c) => c.toUpperCase() === normalized);
}

/** Build the embeddable player URL for YouTube/Vimeo links; null = direct MP4. */
export function embedUrl(url: string): string | null {
  let m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{6,})/);
  if (m) return `https://www.youtube.com/embed/${m[1]}`;
  m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (m) return `https://player.vimeo.com/video/${m[1]}`;
  return null;
}
