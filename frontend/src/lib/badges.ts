/* 🏅 Badge engine — derived honors, computed from state the app already tracks.
 * Class badges: earned when every lesson of a course is completed.
 * Mastery badges: earned on a 100/100 coach score with that style selected.
 * Challenge badges: earned by analyzing 3 shots against a holiday challenge goal.
 * No new storage — badges are true the moment their conditions are met.
 */
import type { TrainingCourse } from "./training";
import type { ShootingStyle } from "./styles";
import { HOLIDAYS, CHALLENGE_SHOTS_TO_COMPLETE } from "./holidays";

export interface Badge {
  id: string;
  emoji: string;
  name: string;
  requirement: string;
  earned: boolean;
  kind: "class" | "mastery" | "challenge";
}

export function classBadges(courses: TrainingCourse[], completedIds: string[]): Badge[] {
  return courses.map((course) => {
    const earned =
      course.lessons.length > 0 && course.lessons.every((l) => completedIds.includes(l.id));
    return {
      id: `class-${course.id}`,
      emoji: course.cover_emoji,
      name: course.title,
      requirement: `Complete all ${course.lessons.length} lessons of ${course.title}`,
      earned,
      kind: "class",
    };
  });
}

export function masteryBadges(styles: ShootingStyle[], sessions: { score: number; style_id: string }[]): Badge[] {
  return styles.map((style) => {
    const earned = sessions.some((s) => s.score >= 100 && s.style_id === style.id);
    return {
      id: `mastery-${style.id}`,
      emoji: style.emoji,
      name: `${style.label} mastered`,
      requirement: `Score a perfect 100/100 with the ${style.label} style selected`,
      earned,
      kind: "mastery",
    };
  });
}

export function challengeBadges(completedIds: string[]): Badge[] {
  return HOLIDAYS.map((holiday) => {
    const earned = completedIds.includes(holiday.id);
    return {
      id: `challenge-${holiday.id}`,
      emoji: holiday.emoji,
      name: holiday.challenge.title,
      requirement: `Analyze ${CHALLENGE_SHOTS_TO_COMPLETE} shots against the ${holiday.name} challenge goal`,
      earned,
      kind: "challenge" as const,
    };
  });
}

export function earnedBadgeCount(badges: Badge[]): number {
  return badges.filter((b) => b.earned).length;
}
