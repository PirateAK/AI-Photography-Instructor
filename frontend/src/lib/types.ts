// Shared types for cameras, settings, EXIF and coach analysis.

export interface SettingOption {
  value: string;
  label: string;
}

export interface KelvinRange {
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface DiscreteSetting {
  type: "discrete";
  label: string;
  default: string;
  options: SettingOption[];
  usable_max?: string;
  usable_note?: string;
  beginner?: string;
  kelvin?: KelvinRange;
}

export interface RangeSetting {
  type: "range";
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  unit?: string;
  beginner?: string;
}

export type SettingDef = DiscreteSetting | RangeSetting;

export interface SettingGroup {
  id: string;
  label: string;
  settings: string[];
}

export interface CameraModel {
  id: string;
  brand: string;
  model: string;
  description: string;
  layout: { groups: SettingGroup[] };
  defaults: Record<string, string | number>;
  settings: Record<string, SettingDef>;
  body?: CameraBody;
}

export interface CameraCatalog {
  version: number;
  notes?: string;
  cameras: CameraModel[];
}

export type Settings = Record<string, string | number>;

export interface ExifInfo {
  has_exif: boolean;
  camera_make?: string | null;
  camera_model?: string | null;
  iso?: number | null;
  shutter_speed?: string | null;
  aperture?: string | null;
  focal_length?: string | null;
  white_balance?: string | null;
  width?: number;
  height?: number;
}

export type Severity = "low" | "medium" | "high";

export interface Issue {
  id: string;
  title: string;
  severity: Severity;
  explanation: string;
}

export interface TechnicalNotes {
  exposure: string;
  white_balance: string;
  noise: string;
  sharpness: string;
}

export interface RecommendedSettings {
  iso?: string | null;
  shutter_speed?: string | null;
  aperture?: string | null;
  white_balance?: string | null;
  exposure_comp?: number | null;
  reasoning: string;
}

export interface PracticeExercise {
  title: string;
  goal: string;
  how: string;
}

export interface AnalysisResult {
  overall_score: number;
  summary: string;
  issues: Issue[];
  technical_notes: TechnicalNotes;
  composition_notes: string[];
  suggested_fixes: { in_camera: string[]; in_post: string[] };
  recommended_settings: RecommendedSettings;
  practice_exercises: PracticeExercise[];
}

export interface CoachResponse {
  provider: string;
  cached: boolean;
  analysis: AnalysisResult;
  chat_response: string;
  notice?: string | null;
}

export interface LogEntry {
  id: number;
  kind: "tip" | "analysis" | "system";
  text: string;
  why?: string;
}

export interface EngineSettings {
  provider: string;
  api_key: string; // masked
  model: string;
  base_url: string;
  active_engine: string;
  engines: string[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

export interface LessonStep {
  settingId: string;
  value: string | number;
  narration: string;
  why?: string;
}

export interface Lesson {
  id: string;
  title: string;
  description: string;
  steps: LessonStep[];
}

export interface BodyHotspot {
  id: string;
  label: string;
  setting?: string;
  info?: string;
  x: number;
  y: number;
}

export interface CameraBody {
  type: "dslr" | "mirrorless";
  hotspots: Partial<Record<"top" | "back" | "front" | "left" | "right" | "bottom", BodyHotspot[]>>;
}
