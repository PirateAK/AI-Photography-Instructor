import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import {
  activeHolidayWindow,
  CHALLENGE_SHOTS_TO_COMPLETE,
  holidayById,
} from "../lib/holidays";

/** 🎄 Holiday challenge card — lives at the top of the coach pane.
 * Suggests the active holiday's challenge, tracks accepted-challenge progress,
 * and seeds the coach chat with the holiday greeting. */
export default function HolidayCard() {
  const activeChallengeId = useStore((s) => s.activeChallengeId);
  const challengeShots = useStore((s) => s.challengeShots);
  const completedChallenges = useStore((s) => s.completedChallenges);
  const acceptChallenge = useStore((s) => s.acceptChallenge);
  const dismissChallenge = useStore((s) => s.dismissChallenge);
  const askCoach = useStore((s) => s.askCoach);
  const goUpload = useStore((s) => s.goUpload);
  const chatMessages = useStore((s) => s.chatMessages);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

  const inWindow = activeHolidayWindow();
  const accepted = holidayById(activeChallengeId);
  const isCompleted = !!accepted && completedChallenges.includes(accepted.id);
  const shots = accepted ? Math.min(challengeShots[accepted.id] ?? 0, CHALLENGE_SHOTS_TO_COMPLETE) : 0;

  // Coach "loads" with the holiday greeting when the chat is still empty.
  useEffect(() => {
    const holiday = accepted ?? inWindow?.holiday ?? null;
    if (holiday && useStore.getState().chatMessages.length === 0) {
      useStore.setState({ chatMessages: [{ role: "assistant", text: holiday.greeting }] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const holiday = accepted ?? inWindow?.holiday ?? null;
  if (!holiday) return null;

  // A: accepted and finished — celebrate, then let them clear it.
  if (accepted && isCompleted) {
    return (
      <div className="holiday-card done" role="status">
        <div className="holiday-head">
          <span className="holiday-title">
            {accepted.emoji} {accepted.challenge.title} — complete!
          </span>
          <button
            className="btn small ghost"
            style={{ padding: "2px 8px", fontSize: "0.72rem" }}
            onClick={() => dismissChallenge()}
            title="Clear this challenge from the coach"
          >
            ✕
          </button>
        </div>
        <div className="holiday-note">
          All {CHALLENGE_SHOTS_TO_COMPLETE} shots analyzed — the {accepted.name} challenge badge is
          on your trophy case. Nice work!
        </div>
        <div className="holiday-actions">
          <button className="btn small primary" onClick={goUpload}>
            Keep shooting
          </button>
        </div>
      </div>
    );
  }

  // B: accepted and in progress — goal + shot counter + bring-shots-back.
  if (accepted) {
    const inSeason = inWindow?.holiday.id === accepted.id;
    return (
      <div className="holiday-card active">
        <div className="holiday-head">
          <span className="holiday-title">
            🎯 {accepted.emoji} {accepted.challenge.title}
          </span>
          {inSeason && (
            <button
              className="btn small ghost"
              style={{ padding: "2px 8px", fontSize: "0.72rem" }}
              onClick={() => dismissChallenge()}
              title="Give up on this challenge — removes it from the coach"
            >
              ✕
            </button>
          )}
        </div>
        <div className="holiday-goal">{accepted.challenge.goal}</div>
        <div className="holiday-progress" aria-label={`Challenge progress: ${shots} of ${CHALLENGE_SHOTS_TO_COMPLETE} shots`}>
          {Array.from({ length: CHALLENGE_SHOTS_TO_COMPLETE }, (_, i) => (
            <span key={i} className={`holiday-dot${i < shots ? " filled" : ""}`} />
          ))}
          <span className="holiday-progress-label">
            {shots}/{CHALLENGE_SHOTS_TO_COMPLETE} shots analyzed
          </span>
        </div>
        <div className="holiday-actions">
          <button className="btn small primary" onClick={goUpload}>
            📸 Bring shots back
          </button>
        </div>
        <HolidayChips askCoach={askCoach} holiday={accepted} />
      </div>
    );
  }

  // C: suggestion — holiday in window, not yet accepted.
  if (!inWindow || suggestionDismissed) return null;
  return (
    <div className="holiday-card suggest">
      <div className="holiday-head">
        <span className="holiday-title">
          {inWindow.holiday.emoji} {inWindow.holiday.name} challenge
        </span>
        <button
          className="btn small ghost"
          style={{ padding: "2px 8px", fontSize: "0.72rem" }}
          onClick={() => setSuggestionDismissed(true)}
          title="Hide this for now"
        >
          ✕
        </button>
      </div>
      <div className="holiday-goal">{inWindow.holiday.challenge.goal}</div>
      <ul className="holiday-tips">
        {inWindow.holiday.tips.slice(0, 3).map((tip, i) => (
          <li key={i}>{tip}</li>
        ))}
      </ul>
      <HolidayChips askCoach={askCoach} holiday={inWindow.holiday} />
      <div className="holiday-actions">
        <button className="btn small primary" onClick={() => acceptChallenge(inWindow.holiday.id)}>
          🎯 Accept the challenge
        </button>
      </div>
    </div>
  );
}

function HolidayChips({
  askCoach,
  holiday,
}: {
  askCoach: (message: string) => Promise<void>;
  holiday: { drilldowns: { id: string; label: string; prompt: string }[] };
}) {
  return (
    <div className="holiday-chips" role="group" aria-label="Ask the coach for details">
      {holiday.drilldowns.map((d) => (
        <button
          key={d.id}
          className="holiday-chip"
          onClick={() => void askCoach(d.prompt)}
          title={d.prompt}
        >
          {d.label}
        </button>
      ))}
    </div>
  );
}
