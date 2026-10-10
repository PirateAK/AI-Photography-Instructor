// Photo history — per-device session storage (GET/POST/DELETE /api/history)
// plus helpers for the Progress screen's stats and score-over-time chart.
export interface HistorySession {
  id: number;
  created_at: string;
  camera_label: string;
  camera_id: string;
  settings: Record<string, string | number>;
  style_id: string;
  intent: string;
  score: number;
  summary: string;
  issues: { title?: string; severity?: string }[];
  provider: string;
  thumbnail: string;
}

export interface ChartPoint {
  x: number; // 0..1 position
  y: number; // score 0..100
  score: number;
  date: string;
}

export async function fetchHistory(deviceId: string): Promise<HistorySession[]> {
  const res = await fetch(`/api/history?device_id=${encodeURIComponent(deviceId)}&limit=200`);
  if (!res.ok) throw new Error("Could not load history");
  return (await res.json()).sessions as HistorySession[];
}

export async function deleteHistoryEntry(deviceId: string, id: number): Promise<void> {
  const res = await fetch(`/api/history/${id}?device_id=${encodeURIComponent(deviceId)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Could not delete session");
}

export async function saveHistorySession(
  deviceId: string,
  payload: Record<string, string>,
  image: File | Blob,
): Promise<void> {
  const form = new FormData();
  for (const [k, v] of Object.entries(payload)) form.append(k, v);
  form.append("device_id", deviceId);
  form.append("image", image);
  const res = await fetch("/api/history", { method: "POST", body: form });
  if (!res.ok) throw new Error("Could not save session");
}

export function buildStats(sessions: HistorySession[]): {
  count: number;
  avg: number;
  best: HistorySession | null;
} {
  if (!sessions.length) return { count: 0, avg: 0, best: null };
  const scores = sessions.map((s) => s.score);
  const best = sessions.reduce((a, b) => (b.score > a.score ? b : a), sessions[0]);
  return {
    count: sessions.length,
    avg: Math.round(scores.reduce((a, b) => a + b, 0) / sessions.length),
    best,
  };
}

/** Chronological points for the score-over-time chart (oldest → newest). */
export function buildChartPoints(sessions: HistorySession[]): ChartPoint[] {
  const asc = [...sessions].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const n = asc.length;
  if (n === 0) return [];
  return asc.map((s, i) => ({
    x: n === 1 ? 0.5 : i / (n - 1),
    y: s.score,
    score: s.score,
    date: s.created_at.slice(0, 10),
  }));
}
