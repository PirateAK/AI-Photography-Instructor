// Photography-style knowledge base (data/shooting_styles.json) — deterministic
// teaching layer: recipes, diagnostics priorities, nudges and drills per style.
import stylesJson from "../../../data/shooting_styles.json";
import type { Settings } from "./types";

export interface StyleExercise {
  title: string;
  goal: string;
  how: string;
}

/** One guided step: set ONE setting, watch the photo respond. */
export interface StyleLessonStep {
  settingId: string;
  value: string | number;
  narration: string;
  why?: string;
}

/** A guided lesson attached to a style. AI drafts arrive as draft:true and only
 *  reach learners once approved (draft cleared) via the Style Manager. */
export interface StyleLesson {
  id: string;
  title: string;
  description: string;
  steps: StyleLessonStep[];
  practice_brief?: string;
  draft?: boolean;
}

export interface StyleRules {
  shutter_floor?: string;
  aperture_target?: string;
  iso_max?: string | number;
  allow_slow_shutter?: boolean;
}

export interface ShootingStyle {
  id: string;
  label: string;
  emoji: string;
  description: string;
  level?: string;
  recipe: {
    summary: string;
    settings: Settings;
    why: string;
  };
  priorities?: Record<string, number>;
  rules?: StyleRules;
  watch_fors?: string[];
  exercises?: StyleExercise[];
  lessons?: StyleLesson[];
}

export interface StyleCatalog {
  version: number;
  notes?: string;
  styles: ShootingStyle[];
}

export const styleCatalog = stylesJson as unknown as StyleCatalog;

export function getStyles(): ShootingStyle[] {
  return styleCatalog.styles;
}

export function getStyle(id: string | undefined | null): ShootingStyle | undefined {
  if (!id) return undefined;
  return styleCatalog.styles.find((s) => s.id === id);
}
