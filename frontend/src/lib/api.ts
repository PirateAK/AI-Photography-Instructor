// Thin API client. In dev, Vite proxies /api to the FastAPI backend.
import type { ChatMessage, CoachResponse, EngineSettings, ExifInfo, Settings } from "./types";

async function postForm<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(path, { method: "POST", body: form });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* keep default */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export async function fetchExif(file: File): Promise<ExifInfo> {
  const form = new FormData();
  form.append("file", file);
  return postForm<ExifInfo>("/api/exif", form);
}

export interface ChallengeContext {
  id: string;
  title: string;
  goal: string;
}

function challengeForm(form: FormData, challenge: ChallengeContext | null | undefined): void {
  if (challenge) form.append("challenge", JSON.stringify(challenge));
}

export async function analyzePhoto(
  file: File,
  cameraId: string,
  settings: Settings,
  intent: string,
  styleId: string = "",
  challenge?: ChallengeContext | null,
): Promise<CoachResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("camera_id", cameraId);
  form.append("settings", JSON.stringify(settings));
  form.append("intent", intent);
  form.append("style_id", styleId);
  challengeForm(form, challenge);
  return postForm<CoachResponse>("/api/analyze", form);
}

export interface ModerationVerdict {
  flagged: boolean;
  category: string;
  reason: string;
  moderated: boolean;
}

/** Content-terms check — runs before a photo may enter the coach or gallery. */
export async function moderatePhoto(file: File): Promise<ModerationVerdict> {
  const form = new FormData();
  form.append("file", file);
  return postForm<ModerationVerdict>("/api/moderate", form);
}

export async function fetchEngineSettings(): Promise<EngineSettings> {  const res = await fetch("/api/settings");
  if (!res.ok) throw new Error("Could not load engine settings");
  return res.json();
}

export async function saveEngineSettings(update: {
  provider?: string;
  api_key?: string;
  model?: string;
  base_url?: string;
  clear_key?: boolean;
}): Promise<EngineSettings> {
  const res = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? "Could not save engine settings");
  }
  return res.json();
}

export async function sendChat(
  message: string,
  history: ChatMessage[],
  cameraId: string,
  settings: Settings,
  styleId: string,
  file?: File | null,
  challenge?: ChallengeContext | null,
): Promise<{ reply: string; provider: string; notice?: string | null }> {
  const form = new FormData();
  form.append("message", message);
  form.append("history", JSON.stringify(history.slice(-12)));
  form.append("camera_id", cameraId);
  form.append("settings", JSON.stringify(settings));
  form.append("style_id", styleId);
  challengeForm(form, challenge);
  if (file) form.append("image", file);
  return postForm("/api/chat", form);
}
