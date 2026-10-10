// Style Manager API client — /api/styles (GET list, POST upsert/delete, POST generate).
import type { ShootingStyle, StyleLesson } from "./styles";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail ?? `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchStyles(): Promise<ShootingStyle[]> {
  const res = await fetch("/api/styles");
  if (!res.ok) throw new Error("Could not load styles");
  return (await res.json()).styles as ShootingStyle[];
}

export function upsertStyle(style: ShootingStyle): Promise<ShootingStyle[]> {
  return post("/api/styles", { action: "upsert", style });
}

export function removeStyle(id: string): Promise<ShootingStyle[]> {
  return post("/api/styles", { action: "delete", style_id: id });
}

export function generateStyleDraft(
  name: string,
): Promise<{ draft: ShootingStyle; validation_errors: string[] }> {
  return post("/api/styles/generate", { name });
}

export function generateStyleLessons(
  styleId: string,
): Promise<{ draft_lessons: StyleLesson[]; validation_errors: string[] }> {
  return post("/api/styles/generate-lessons", { style_id: styleId });
}
