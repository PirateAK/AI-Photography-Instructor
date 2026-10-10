import { useStore } from "../state/store";
import { courses } from "../lib/training";

/**
 * Hidden hub for the app's content owners. Unlocked by typing an instructor
 * code into the home screen's "What do you want to learn or shoot?" field;
 * the unlock persists in this browser until re-locked. From here, shooting
 * styles and training classes are fully editable without touching a file.
 */
export default function InstructorDashboard() {
  const goUpload = useStore((s) => s.goUpload);
  const goStyleManager = useStore((s) => s.goStyleManager);
  const goCourseManager = useStore((s) => s.goCourseManager);
  const lockInstructor = useStore((s) => s.lockInstructor);
  const styles = useStore((s) => s.styles);

  const totalLessons = courses.reduce((n, c) => n + c.lessons.length, 0);

  return (
    <div className="upload-wrap">
      <div className="upload-hero">
        <h1>🛠 Instructor Dashboard</h1>
        <p>
          Your content cockpit — everything here writes the app's real data files with automatic
          backups, and the app picks up changes instantly.
        </p>
      </div>

      <div className="dash-grid">
        <button className="dash-card" onClick={goStyleManager}>
          <div className="dash-emoji">🎨</div>
          <div className="dash-title">Shooting styles</div>
          <div className="dash-count">
            {styles.length} tailored recipe{styles.length === 1 ? "" : "s"}
          </div>
          <p>
            The "what are you shooting" chips and the coach's priorities, nudges, watch-fors and
            drills for each genre. Add, edit, delete — or draft a new one with AI.
          </p>
          <span className="dash-go">Open Style Manager →</span>
        </button>

        <button className="dash-card" onClick={goCourseManager}>
          <div className="dash-emoji">🎓</div>
          <div className="dash-title">Training classes</div>
          <div className="dash-count">
            {courses.length} courses · {totalLessons} lessons
          </div>
          <p>
            The curriculum: videos, summaries, difficulties and the interactive "Try it" simulator
            drills. Build courses by hand, draft with AI, or import a contributor's JSON.
          </p>
          <span className="dash-go">Open Course Manager →</span>
        </button>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div className="section-title" style={{ marginTop: 0 }}>Housekeeping</div>
        <ul className="dash-notes">
          <li>Every save rewrites the source JSON and keeps a timestamped backup next to it.</li>
          <li>Edits made directly to the files outside the app are picked up on the next reload.</li>
          <li>
            Camera and lens catalogs still live in <code>data/</code> — tell the assistant when you
            want those managed from here too.
          </li>
        </ul>
        <div className="upload-row">
          <button className="btn" onClick={goUpload}>
            ← Back to home
          </button>
          <button className="btn small ghost" onClick={lockInstructor} title="Hide the dashboard again on this device">
            🔒 Lock this dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
