// 📈 Progress — per-device photo history: stats, score-over-time chart and a
// browsable session list. Sessions auto-save after every successful analysis.
import { useEffect, useMemo, useState } from "react";
import { useStore } from "../state/store";
import { courseProgress } from "../lib/training";
import {
  buildChartPoints,
  buildStats,
  deleteHistoryEntry,
  fetchHistory,
  type HistorySession,
} from "../lib/history";

export default function ProgressScreen() {
  const deviceId = useStore((s) => s.deviceId);
  const styles = useStore((s) => s.styles);
  const courses = useStore((s) => s.courses);
  const completedLessons = useStore((s) => s.completedLessons);
  const goUpload = useStore((s) => s.goUpload);
  const dataUrl = useStore((s) => s.dataUrl);
  const openWorkspace = useStore((s) => s.openWorkspace);

  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setSessions(await fetchHistory(deviceId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => buildStats(sessions), [sessions]);
  const points = useMemo(() => buildChartPoints(sessions), [sessions]);

  const remove = async (id: number) => {
    if (!window.confirm("Delete this session from your history?")) return;
    try {
      await deleteHistoryEntry(deviceId, id);
      setSessions((list) => list.filter((s) => s.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div className="upload-wrap">
      <div className="upload-hero">
        <h1>📈 Progress</h1>
        <p>
          Every analysis you run is saved automatically on this device — watch your scores climb
          as you practice. Sessions never leave this machine.
        </p>
        <div className="upload-row">
          <button className="btn" onClick={dataUrl ? openWorkspace : goUpload}>
            ← {dataUrl ? "Back to workspace" : "Back to upload"}
          </button>
        </div>
      </div>

      {loading && <div className="analyzing-box"><div className="spinner" /><div>Loading your history…</div></div>}

      {!loading && error && <div className="coach-error" style={{ padding: 14 }}>{error}</div>}

      {!loading && !error && sessions.length === 0 && (
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: "2rem", marginBottom: 8 }}>📷</div>
          <h3 style={{ margin: "0 0 6px" }}>No saved sessions yet</h3>
          <p className="muted" style={{ lineHeight: 1.55 }}>
            Analyze a photo and it will appear here automatically — score, settings, issues and
            all. Do the same shot again next week and watch the progress line move.
          </p>
        </div>
      )}

      {!loading && !error && sessions.length > 0 && (
        <>
          <div className="stats-grid" style={{ marginBottom: 14 }}>
            <div className="card stat-card">
              <div className="stat-k">Analyses saved</div>
              <div className="stat-v">{stats.count}</div>
            </div>
            <div className="card stat-card">
              <div className="stat-k">Average score</div>
              <div className="stat-v">{stats.avg}</div>
            </div>
            <div className="card stat-card">
              <div className="stat-k">Best score</div>
              <div className="stat-v">
                {stats.best?.score}
                <span className="muted" style={{ fontSize: "0.75rem", fontWeight: 400 }}>
                  {" "}· {stats.best?.created_at.slice(0, 10)}
                </span>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 16, marginBottom: 14 }}>
            <div className="section-title">Score over time</div>
            <ScoreChart points={points} />
          </div>

          <div className="card" style={{ padding: 16, marginBottom: 14 }}>
            <div className="section-title">Curriculum progress</div>
            <div className="curriculum-list">
              {courses.map((course) => {
                const p = courseProgress(course, completedLessons);
                return (
                  <div key={course.id} className="curriculum-row">
                    <span className="curriculum-title">
                      {course.cover_emoji} {course.title}
                    </span>
                    <div className="course-progress-bar" style={{ flex: 1 }}>
                      <div style={{ width: `${p.pct}%` }} />
                    </div>
                    <span className="muted" style={{ fontSize: "0.74rem", fontVariantNumeric: "tabular-nums" }}>
                      {p.done}/{p.total}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="section-title">Sessions</div>
          <div className="history-list">
            {sessions.map((s) => (
              <div className="card history-row" key={s.id}>
                {s.thumbnail ? (
                  <img src={s.thumbnail} alt="" className="history-thumb" />
                ) : (
                  <div className="history-thumb">📷</div>
                )}
                <div className="history-body">
                  <div className="history-head">
                    <strong>{new Date(s.created_at).toLocaleString()}</strong>
                    <span className={`chip ${s.score >= 75 ? "good" : s.score >= 50 ? "medium" : "high"}`}>
                      {s.score}/100
                    </span>
                  </div>
                  <div className="muted" style={{ fontSize: "0.78rem" }}>
                    {[s.camera_label, styleLabel(s.style_id), s.intent].filter(Boolean).join(" · ") ||
                      "analysis"}
                  </div>
                  <div style={{ fontSize: "0.84rem", lineHeight: 1.5, marginTop: 4 }}>{s.summary}</div>
                  {s.issues.length > 0 && (
                    <div className="muted" style={{ fontSize: "0.74rem", marginTop: 4 }}>
                      Issues: {s.issues.map((i) => i.title).filter(Boolean).join(", ")}
                    </div>
                  )}
                </div>
                <button className="btn small" onClick={() => remove(s.id)} title="Delete this session">
                  🗑
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function styleLabel(id: string): string {
  return useStore.getState().styles.find((s) => s.id === id)?.label ?? "";
}

function ScoreChart({ points }: { points: { x: number; y: number; score: number; date: string }[] }) {
  const W = 640;
  const H = 200;
  const padX = 34;
  const padY = 14;
  const px = (x: number) => padX + x * (W - padX * 2);
  const py = (y: number) => H - padY - (y / 100) * (H - padY * 2);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${px(p.x).toFixed(1)} ${py(p.y).toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Score over time">
      {[0, 25, 50, 75, 100].map((g) => (
        <g key={g}>
          <line x1={padX} x2={W - padX} y1={py(g)} y2={py(g)} stroke="#2a2e37" strokeWidth="1" />
          <text x={4} y={py(g) + 4} fontSize="10" fill="#9a9fab">{g}</text>
        </g>
      ))}
      {points.length > 1 && <path d={line} fill="none" stroke="#0a84ff" strokeWidth="2" />}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={px(p.x)} cy={py(p.y)} r="4" fill="#0a84ff" stroke="#fff" strokeWidth="1">
            <title>{`${p.date}: ${p.score}/100`}</title>
          </circle>
        </g>
      ))}
      {points.length > 0 && (
        <>
          <text x={padX} y={H - 2} fontSize="10" fill="#9a9fab">{points[0].date}</text>
          <text x={W - padX} y={H - 2} fontSize="10" fill="#9a9fab" textAnchor="end">
            {points[points.length - 1].date}
          </text>
        </>
      )}
    </svg>
  );
}
