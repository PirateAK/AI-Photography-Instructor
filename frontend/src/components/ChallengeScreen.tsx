// 🏆 Challenge — the shared holiday contest: submit shots, vote top 3, winners.
// Other people's entries are server-generated thumbnails only — full-res
// originals never leave the photographer's device.
import { useCallback, useEffect, useState } from "react";
import { useStore } from "../state/store";
import { activeHoliday, contestSchedule, HOLIDAYS } from "../lib/holidays";
import { getCameras } from "../lib/camera";
import {
  deleteChallengeEntry,
  fetchChallenge,
  submitChallengeEntry,
  voteChallenge,
  type ChallengeView,
} from "../lib/challenges";
import { getGalleryBlob } from "../lib/gallery";
import { stampPhoto } from "../lib/stamp";
import { buildContestShareMessage, sharePhotoBlob, type ShareResult } from "../lib/share";

const VOTE_PICKS = 3;

function autoHolidayId(): string | null {
  const live = HOLIDAYS.map((h) => ({ id: h.id, phase: contestSchedule(h).phase })).find(
    (x) => x.phase === "voting" || x.phase === "results",
  );
  return live?.id ?? activeHoliday()?.id ?? null;
}

const PHASE_LABEL: Record<string, string> = {
  upcoming: "Starts soon",
  submitting: "Submissions open",
  voting: "Voting open",
  results: "Results",
};

export default function ChallengeScreen() {
  const goUpload = useStore((s) => s.goUpload);
  const deviceId = useStore((s) => s.deviceId);
  const challengeHolidayId = useStore((s) => s.challengeHolidayId);
  const file = useStore((s) => s.file);
  const dataUrl = useStore((s) => s.dataUrl);
  const analysis = useStore((s) => s.analysis);
  const cameraId = useStore((s) => s.cameraId);
  const addToGallery = useStore((s) => s.addToGallery);
  const linkChallengePhoto = useStore((s) => s.linkChallengePhoto);
  const challengePhotoByEntry = useStore((s) => s.challengePhotoByEntry);

  const [holidayId, setHolidayId] = useState<string | null>(challengeHolidayId ?? autoHolidayId());
  const [view, setView] = useState<ChallengeView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [picks, setPicks] = useState<number[]>([]);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!holidayId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const v = await fetchChallenge(holidayId, deviceId);
      setView(v);
      setPicks(v.my_votes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the challenge.");
    } finally {
      setLoading(false);
    }
  }, [holidayId, deviceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const cameraInfo = (): string => {
    const cam = getCameras().find((c) => c.id === cameraId);
    return cam ? `${cam.brand} ${cam.model}`.slice(0, 80) : "";
  };

  const submitCurrent = async () => {
    if (!view || !file || !analysis) return;
    setBusy(true);
    setError(null);
    try {
      const res = await submitChallengeEntry(
        file,
        deviceId,
        view.holiday_id,
        analysis.overall_score,
        cameraInfo(),
      );
      // guarantee the full-res original lives in this device's gallery
      const gallery = await addToGallery([file]);
      if (gallery.ids.length > 0) linkChallengePhoto(res.entry_id, gallery.ids[0]);
      setNote(
        gallery.ids.length > 0
          ? "Submitted! A copy is saved in your gallery, just in case you win. 🏅"
          : "Submitted to the challenge!",
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed.");
    } finally {
      setBusy(false);
    }
  };

  const togglePick = (entryId: number) => {
    setPicks((prev) => {
      if (prev.includes(entryId)) return prev.filter((p) => p !== entryId);
      if (prev.length >= VOTE_PICKS) return [...prev.slice(1), entryId];
      return [...prev, entryId];
    });
  };

  const saveVotes = async () => {
    if (!view) return;
    setBusy(true);
    try {
      await voteChallenge(view.holiday_id, deviceId, picks);
      setNote(picks.length ? "Votes saved — you can change them until voting ends." : "Votes cleared.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save votes.");
    } finally {
      setBusy(false);
    }
  };

  const removeMine = async (entryId: number) => {
    setBusy(true);
    try {
      await deleteChallengeEntry(deviceId, entryId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove that entry.");
    } finally {
      setBusy(false);
    }
  };

  const stampAndShare = async (entryId: number, place: number, score: number, holidayName: string) => {
    setBusy(true);
    setNote(null);
    try {
      const galleryId = challengePhotoByEntry[String(entryId)];
      const blob = galleryId != null ? await getGalleryBlob(galleryId) : null;
      if (!blob) {
        setNote("The full-res original lives on the device that submitted this shot — open it there to stamp it.");
        return;
      }
      const stamped = await stampPhoto(blob, { score, holidayName, place });
      await addToGallery([new File([stamped], `${holidayName.toLowerCase().replace(/\s+/g, "-")}-winner.jpg`, { type: "image/jpeg" })]);
      const result: ShareResult = await sharePhotoBlob(
        stamped,
        buildContestShareMessage(place, holidayName, score),
      );
      setNote(
        result === "shared"
          ? "Stamped photo saved to your gallery and shared! 🎖"
          : result === "copied"
            ? "Saved to your gallery — the share text is on your clipboard."
            : "Stamped photo saved to your gallery — share it from there anytime.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Stamping failed.");
    } finally {
      setBusy(false);
    }
  };

  const liveContests = HOLIDAYS.map((h) => ({ id: h.id, label: `${h.emoji} ${h.name}`, phase: contestSchedule(h).phase })).filter(
    (x) => x.phase === "submitting" || x.phase === "voting" || x.phase === "results",
  );

  return (
    <div className="upload-wrap">
      <div className="upload-hero">
        <h1>🏆 Photo Challenge</h1>
        <p>
          Submit your challenge shots, vote for your favorites, and see who takes the podium.
          Other people's photos can't be downloaded — only you keep your originals.
        </p>
        <div className="upload-row">
          <button className="btn" onClick={goUpload}>
            ← Home
          </button>
        </div>
      </div>

      {liveContests.length > 1 && (
        <div className="holiday-chips" style={{ marginBottom: 12 }}>
          {liveContests.map((c) => (
            <button
              key={c.id}
              className={`holiday-chip${c.id === holidayId ? " active" : ""}`}
              onClick={() => {
                setHolidayId(c.id);
                setNote(null);
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="analyzing-box">
          <div className="spinner" />
          <div>Loading the challenge…</div>
        </div>
      )}

      {!loading && error && <div className="coach-error" style={{ padding: 14 }}>{error}</div>}
      {note && <div className="notice" role="status">{note}</div>}

      {!loading && !error && !view && (
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: "2rem" }}>🗓️</div>
          <h3 style={{ margin: "8px 0" }}>No challenge is live right now</h3>
          <p className="muted" style={{ lineHeight: 1.55 }}>
            Contest galleries open with each holiday — the first one starts 7 days before the
            holiday itself. Watch the banner on the home screen.
          </p>
        </div>
      )}

      {!loading && view && (
        <>
          <div className="card" style={{ padding: 16, marginBottom: 14 }}>
            <div className="section-title" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span>
                {view.emoji} {view.name} — {view.challenge_title}
              </span>
              <span className={`chip ${view.phase === "results" ? "good" : "low"}`}>
                {PHASE_LABEL[view.phase] ?? view.phase}
              </span>
            </div>
            <p className="muted" style={{ fontSize: "0.82rem", lineHeight: 1.5, margin: "4px 0 0" }}>
              {view.phase === "submitting" && <>Submissions close {fmt(view.submit_ends_at)} — then voting runs for 7 days.</>}
              {view.phase === "voting" && <>Voting ends {fmt(view.vote_ends_at)} — pick your top {VOTE_PICKS} favorites.</>}
              {view.phase === "results" && view.resets_in_days != null && (
                <>
                  Winners are final. This gallery resets in{" "}
                  <strong style={{ color: "#ffd60a" }}>
                    {view.resets_in_days} day{view.resets_in_days === 1 ? "" : "s"}
                  </strong>{" "}
                  when the next challenge opens.
                </>
              )}
              {view.phase === "upcoming" && <>Opens {fmt(view.submit_starts_at)}.</>}
            </p>
          </div>

          {view.phase === "submitting" && (
            <div className="card" style={{ padding: 14, marginBottom: 14 }}>
              <SubmitRow
                canSubmit={!!file && !!analysis}
                hasSessionPhoto={!!file || !!dataUrl}
                mine={view.my_entries.length}
                busy={busy}
                onSubmit={() => void submitCurrent()}
              />
            </div>
          )}

          {view.phase === "voting" && (
            <div className="card" style={{ padding: 14, marginBottom: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span className="muted" style={{ fontSize: "0.85rem" }}>
                {picks.length}/{VOTE_PICKS} picked — tap photos to choose
              </span>
              <button className="btn primary small" disabled={busy} onClick={() => void saveVotes()}>
                Save votes
              </button>
            </div>
          )}

          {view.phase === "results" && view.winners.length > 0 && (
            <div className="card" style={{ padding: 16, marginBottom: 14 }}>
              <div className="section-title">🥇 The podium</div>
              <div className="challenge-podium">
                {view.winners.map((w) => {
                  const entry = view.entries.find((e) => e.id === w.entry_id);
                  if (!entry) return null;
                  const place = w.place;
                  return (
                    <div key={w.entry_id} className={`challenge-entry podium-${place}`}>
                      <EntryImage entry={entry} />
                      <div className="challenge-entry-meta">
                        <span className="chip good">
                          {place === 1 ? "🥇 1st" : place === 2 ? "🥈 2nd" : "🥉 3rd"} · {w.votes} vote{w.votes === 1 ? "" : "s"}
                        </span>
                        <span className="chip low">Coach {entry.score}/100</span>
                      </div>
                      {entry.mine && (
                        <button
                          className="btn primary small"
                          style={{ marginTop: 8, width: "100%" }}
                          disabled={busy}
                          onClick={() => void stampAndShare(entry.id, place, entry.score, view.name)}
                        >
                          🎖 Save &amp; share stamped photo
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {view.past_winners.length > 0 && (
            <div className="card" style={{ padding: 16, marginBottom: 14 }}>
              <div className="section-title">🏆 Hall of winners — shots to aspire to</div>
              <div className="hall-grid">
                {view.past_winners.map((p) => (
                  <div key={`${p.year}-${p.place}`} className="hall-card">
                    <img
                      src={p.thumb}
                      alt={`${p.year} ${p.place === 1 ? "1st" : p.place === 2 ? "2nd" : "3rd"} place`}
                      draggable={false}
                      className="hall-img"
                      onContextMenu={(e) => e.preventDefault()}
                    />
                    <div className="challenge-entry-meta">
                      <span className="chip good">
                        {p.place === 1 ? "🥇" : p.place === 2 ? "🥈" : "🥉"} {p.year}
                      </span>
                      <span className="chip low">Coach {p.score}/100</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="muted" style={{ fontSize: "0.76rem", margin: "8px 0 0" }}>
                Winners' galleries from past seasons — the images stay in the hall, full-res
                originals never leave their photographers' devices.
              </p>
            </div>
          )}

          <div className="challenge-grid">
            {view.entries.map((e) => {
              const place = view.winners.find((w) => w.entry_id === e.id)?.place;
              const picked = picks.includes(e.id);
              return (
                <div key={e.id} className={`challenge-entry${picked ? " picked" : ""}`}>
                  <button
                    type="button"
                    className="challenge-img-btn"
                    onClick={view.phase === "voting" && !e.mine ? () => togglePick(e.id) : undefined}
                    disabled={busy}
                    aria-label={view.phase === "voting" && !e.mine ? "Toggle vote for this photo" : undefined}
                  >
                    <EntryImage entry={e} />
                    {view.phase === "voting" && !e.mine && (
                      <span className="challenge-pick" aria-hidden="true">
                        {picked ? "✓" : ""}
                      </span>
                    )}
                    {place && (
                      <span className="challenge-medal" aria-hidden="true">
                        {place === 1 ? "🥇" : place === 2 ? "🥈" : "🥉"}
                      </span>
                    )}
                  </button>
                  <div className="challenge-entry-meta">
                    <span className="chip low">Coach {e.score}/100</span>
                    {e.mine && <span className="chip dim">yours</span>}
                    {view.phase === "results" && typeof e.votes === "number" && (
                      <span className="chip good">{e.votes} vote{e.votes === 1 ? "" : "s"}</span>
                    )}
                  </div>
                  {view.phase === "submitting" && e.mine && (
                    <button className="btn small ghost" style={{ marginTop: 6 }} disabled={busy} onClick={() => void removeMine(e.id)}>
                      Remove
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {view.entries.length === 0 && view.phase !== "upcoming" && (
            <div className="card" style={{ padding: 24, textAlign: "center" }}>
              <div style={{ fontSize: "2rem" }}>📭</div>
              <h3 style={{ margin: "8px 0" }}>No entries yet</h3>
              <p className="muted">Be the first to submit a challenge shot!</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SubmitRow({
  canSubmit,
  hasSessionPhoto,
  mine,
  busy,
  onSubmit,
}: {
  canSubmit: boolean;
  hasSessionPhoto: boolean;
  mine: number;
  busy: boolean;
  onSubmit: () => void;
}) {
  if (!hasSessionPhoto || !canSubmit) {
    return (
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span className="muted" style={{ fontSize: "0.85rem" }}>
          Get your shot coached first, then submit it here.
        </span>
        <SubmitLinkButton />
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <button className="btn primary" disabled={busy} onClick={onSubmit}>
        🏅 Submit this photo ({mine}/3 entered)
      </button>
      <span className="muted" style={{ fontSize: "0.8rem" }}>
        The Coach rating travels with it — up to 3 entries per person.
      </span>
    </div>
  );
}

function SubmitLinkButton() {
  const goUpload = useStore((s) => s.goUpload);
  return (
    <button className="btn primary small" onClick={goUpload}>
      📷 Coach a photo first
    </button>
  );
}

function EntryImage({ entry }: { entry: { thumb: string } }) {
  return (
    <img
      src={entry.thumb}
      alt="Challenge entry"
      draggable={false}
      className="challenge-img"
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}
