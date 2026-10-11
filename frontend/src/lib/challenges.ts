/* 🏆 Challenge contest API client — shared entries + voting.
 * The server stores only 640px thumbs; full-res originals never leave the device. */

export type ChallengePhase = "upcoming" | "submitting" | "voting" | "results";

export interface ChallengeEntry {
  id: number;
  score: number;
  camera_label: string;
  created_at: string;
  mine: boolean;
  thumb: string;
  votes?: number;
}

export interface ChallengeWinner {
  entry_id: number;
  place: number;
  votes: number;
}

export interface ChallengeView {
  holiday_id: string;
  name: string;
  emoji: string;
  challenge_title: string;
  phase: ChallengePhase;
  submit_starts_at: string;
  submit_ends_at: string;
  vote_ends_at: string;
  gallery_resets_at: string | null;
  resets_in_days: number | null;
  entries_count: number;
  entries: ChallengeEntry[];
  my_entries: number[];
  my_votes: number[];
  winners: ChallengeWinner[];
}

export async function fetchChallenge(holidayId: string, deviceId: string): Promise<ChallengeView> {
  const res = await fetch(`/api/challenge/${encodeURIComponent(holidayId)}?device_id=${encodeURIComponent(deviceId)}`);
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.detail ?? "Could not load the challenge.");
  return res.json();
}

export async function submitChallengeEntry(file: File, deviceId: string, holidayId: string, score: number, cameraLabel: string): Promise<{ entry_id: number }> {
  const form = new FormData();
  form.append("device_id", deviceId);
  form.append("holiday_id", holidayId);
  form.append("score", String(Math.round(score)));
  form.append("camera_label", cameraLabel);
  form.append("image", file);
  const res = await fetch("/api/challenge/submit", { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? "Could not submit to the challenge.");
  }
  return res.json();
}

export async function voteChallenge(holidayId: string, deviceId: string, entryIds: number[]): Promise<{ voted: number[] }> {
  const form = new FormData();
  form.append("device_id", deviceId);
  form.append("holiday_id", holidayId);
  form.append("entry_ids", JSON.stringify(entryIds));
  const res = await fetch("/api/challenge/vote", { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? "Could not save your votes.");
  }
  return res.json();
}

export async function deleteChallengeEntry(deviceId: string, entryId: number): Promise<void> {
  const form = new FormData();
  form.append("device_id", deviceId);
  form.append("entry_id", String(entryId));
  const res = await fetch("/api/challenge/entry/delete", { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? "Could not remove that entry.");
  }
}
