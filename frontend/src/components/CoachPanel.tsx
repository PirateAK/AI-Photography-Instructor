import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../state/store";
import { baselineFromExif, defaultSettings, evDelta, getCamera } from "../lib/camera";
import { buildLessons, type Lesson } from "../lib/lessons";
import { FALLBACK_TIPS } from "../lib/tips";
import HolidayCard from "./HolidayCard";

export default function CoachPanel() {
  const analysis = useStore((s) => s.analysis);
  const chat = useStore((s) => s.chat);
  const coachMeta = useStore((s) => s.coachMeta);
  const analyzing = useStore((s) => s.analyzing);
  const analyzeError = useStore((s) => s.analyzeError);
  const log = useStore((s) => s.log);
  const styleId = useStore((s) => s.styleId);
  const applyRecommended = useStore((s) => s.applyRecommended);
  const applyRecipe = useStore((s) => s.applyRecipe);
  const undoApply = useStore((s) => s.undoApply);
  const undoSnapshot = useStore((s) => s.undoSnapshot);
  const goSettings = useStore((s) => s.goSettings);
  const exif = useStore((s) => s.exif);
  const cameraId = useStore((s) => s.cameraId);
  const camPanel = getCamera(cameraId);
  const baseline = camPanel ? baselineFromExif(camPanel, exif) : null;
  const styles = useStore((s) => s.styles);
  const setStyle = useStore((s) => s.setStyle);
  const style = styles.find((s) => s.id === styleId);

  return (
    <>
      {coachMeta?.notice && <div className="notice">{coachMeta.notice}</div>}

      {!analyzing && style && (
        <div className="card" style={{ padding: 14, borderColor: "rgba(10,132,255,0.35)" }}>
          <div className="section-title" style={{ color: "#7db8ff", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span>
              {style.emoji} {style.label} — starting recipe
            </span>
            <button
              className="btn small ghost"
              style={{ padding: "2px 8px", fontSize: "0.72rem" }}
              onClick={() => setStyle("")}
              title="Clear the style — the coach returns to general-purpose judging"
            >
              ✕ clear style
            </button>
          </div>
          <div className="rec-row">
            {Object.entries(style.recipe.settings).map(([k, v]) => (
              <span className="rec-pill" key={k}>
                <span className="k">{k.replace("_", " ")}</span>
                {String(v)}
              </span>
            ))}
          </div>
          <div className="rec-reason">{style.recipe.why}</div>
          {style.watch_fors && style.watch_fors.length > 0 && (
            <div className="muted" style={{ marginBottom: 10, fontSize: "0.78rem", lineHeight: 1.5 }}>
              <strong>Watch out for:</strong> {style.watch_fors.join(" · ")}
            </div>
          )}
          <button className="btn primary small" onClick={applyRecipe}>
            ⚡ Use recipe
          </button>
        </div>
      )}

      {analyzing && (
        <div className="analyzing-box card" style={{ padding: 30 }}>
          <div className="spinner" />
          <div>Coach is looking at your photo…</div>
          <div className="muted">Checking exposure, color, noise, sharpness and composition.</div>
        </div>
      )}

      {!analyzing && analyzeError && (
        <div className="coach-error card">
          <h4>Analysis failed</h4>
          <p className="muted" style={{ marginTop: 0 }}>
            {analyzeError}. The coach couldn't finish — here are tips that help in almost any
            situation:
          </p>
          <ul>
            {FALLBACK_TIPS.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </div>
      )}

      {!analyzing && analysis && (
        <>
          <LessonPlayer />

          <div className="card" style={{ padding: 16 }}>
            <div className="coach-score">
              <ScoreRing score={analysis.overall_score} />
              <div style={{ display: "grid", gap: 6 }}>
                <div className="coach-summary">{chat ?? analysis.summary}</div>
                <div
                  className="muted"
                  style={{ fontSize: "0.72rem" }}
                  title="Upgrade to scene-aware AI critique by adding an API key on the Setup page — the heuristic coach stays as automatic fallback."
                >
                  Coach engine: {engineLabel(coachMeta?.provider)} · <button className="link-btn" onClick={goSettings}>⚙ Setup</button>
                </div>
              </div>
            </div>
          </div>

          {analysis.issues.length > 0 && (
            <section>
              <div className="section-title">Issues found</div>
              {analysis.issues.map((issue) => (
                <div className="issue" key={issue.id}>
                  <div className="issue-head">
                    {issue.title}
                    <span className={`chip ${issue.severity}`}>{issue.severity}</span>
                  </div>
                  <div style={{ fontSize: "0.84rem", lineHeight: 1.5, color: "#c9ccd4" }}>
                    {issue.explanation}
                  </div>
                </div>
              ))}
            </section>
          )}

          <section>
            <div className="section-title">Technical notes</div>
            <div className="notes-grid">
              <Note k="Exposure" v={analysis.technical_notes.exposure} />
              <Note k="White balance" v={analysis.technical_notes.white_balance} />
              <Note k="Noise" v={analysis.technical_notes.noise} />
              <Note k="Sharpness" v={analysis.technical_notes.sharpness} />
            </div>
          </section>

          {analysis.composition_notes.length > 0 && (
            <section>
              <div className="section-title">Composition</div>
              {analysis.composition_notes.map((note, i) => (
                <p key={i} className="muted" style={{ margin: "0 0 8px", lineHeight: 1.55 }}>
                  {note}
                </p>
              ))}
            </section>
          )}

          <section>
            <div className="section-title">Suggested fixes</div>
            <div className="fix-cols">
              <div className="fix-col">
                <h4>📸 In camera (next time)</h4>
                <ul>
                  {analysis.suggested_fixes.in_camera.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>
              <div className="fix-col">
                <h4>💻 In post</h4>
                <ul>
                  {analysis.suggested_fixes.in_post.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className="rec-card card" style={{ padding: 14 }}>
            <div className="section-title" style={{ color: "#7db8ff" }}>
              Recommended next settings
            </div>
            <div className="rec-row">
              {analysis.recommended_settings.iso && (
                <span className="rec-pill">
                  <span className="k">ISO</span>
                  {analysis.recommended_settings.iso}
                </span>
              )}
              {analysis.recommended_settings.shutter_speed && (
                <span className="rec-pill">
                  <span className="k">Shutter</span>
                  {analysis.recommended_settings.shutter_speed}
                </span>
              )}
              {analysis.recommended_settings.aperture && (
                <span className="rec-pill">
                  <span className="k">Aperture</span>
                  {analysis.recommended_settings.aperture}
                </span>
              )}
              {analysis.recommended_settings.white_balance && (
                <span className="rec-pill">
                  <span className="k">WB</span>
                  {analysis.recommended_settings.white_balance}
                </span>
              )}
              {typeof analysis.recommended_settings.exposure_comp === "number" && (
                <span className="rec-pill">
                  <span className="k">EV</span>
                  {analysis.recommended_settings.exposure_comp > 0 ? "+" : ""}
                  {analysis.recommended_settings.exposure_comp}
                </span>
              )}
            </div>
            {baseline &&
              analysis.recommended_settings.iso &&
              analysis.recommended_settings.shutter_speed &&
              analysis.recommended_settings.aperture &&
              (() => {
                const delta = evDelta(baseline, {
                  iso: analysis.recommended_settings.iso!,
                  shutter_speed: analysis.recommended_settings.shutter_speed!,
                  aperture: analysis.recommended_settings.aperture!,
                  exposure_comp: analysis.recommended_settings.exposure_comp ?? undefined,
                });
                if (Math.abs(delta) < 3) return null;
                return (
                  <div className="notice" style={{ marginBottom: 10 }}>
                    ⚠ These settings are ~{Math.abs(delta)} stops {delta > 0 ? "brighter" : "darker"} than your
                    as-shot exposure — the preview will show the literal result
                    {delta > 0 ? " (likely blown out)" : " (very dark)"}. Unless this photo was badly{" "}
                    {delta > 0 ? "underexposed" : "overexposed"}, treat with caution.
                  </div>
                );
              })()}
            <div className="rec-reason">{analysis.recommended_settings.reasoning}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn primary small" onClick={() => applyRecommended(analysis.recommended_settings)}>
                ⚡ Apply to simulator
              </button>
              {undoSnapshot && (
                <button className="btn small" onClick={undoApply}>
                  ↩ Undo
                </button>
              )}
            </div>
          </section>

          <section>
            <div className="section-title">Practice exercises</div>
            {analysis.practice_exercises.map((ex, i) => (
              <div className="exercise" key={i}>
                <h4>
                  <span className="num">{i + 1}</span>
                  {ex.title}
                </h4>
                <p>
                  <strong>Goal:</strong> {ex.goal}
                </p>
                <p>
                  <strong>How:</strong> {ex.how}
                </p>
              </div>
            ))}
          </section>
        </>
      )}

      <section>
        <div className="section-title">Session log · coach tips</div>
        {log.length === 0 && (
          <div className="muted">
            Change any setting in the toolbar and I'll explain what just happened to your photo.
          </div>
        )}
        {log.map((entry) => (
          <LogItem key={entry.id} kind={entry.kind} text={entry.text} why={entry.why} />
        ))}
      </section>

      <HolidayCard />
      <CoachChat />
    </>
  );
}

function engineLabel(provider?: string | null): string {
  if (provider === "openai") return "OpenAI vision";
  if (provider === "gemini") return "Gemini vision";
  return "Heuristic (offline)";
}

// --------------------------------------------------------- guided lessons

function LessonPlayer() {
  const cameraId = useStore((s) => s.cameraId);
  const exif = useStore((s) => s.exif);
  const styleId = useStore((s) => s.styleId);
  const analysis = useStore((s) => s.analysis);
  const settingsByCamera = useStore((s) => s.settingsByCamera);
  const updateSetting = useStore((s) => s.updateSetting);
  const setHighlight = useStore((s) => s.setHighlight);
  const beginUndoable = useStore((s) => s.beginUndoable);
  const undoApply = useStore((s) => s.undoApply);
  const undoSnapshot = useStore((s) => s.undoSnapshot);

  const [open, setOpen] = useState(false);
  const [lessonIdx, setLessonIdx] = useState(0);
  const [stepIdx, setStepIdx] = useState(-1);

  const cam = getCamera(cameraId)!;
  const settings = settingsByCamera[cameraId] ?? defaultSettings(cam);
  const style = useStore((s) => s.styles.find((x) => x.id === s.styleId));

  const lessons = useMemo(
    () => buildLessons(cam, settings, exif, style, analysis),
    // rebuild only when opened or the photo/camera changes — steps must be stable mid-lesson
    [cam, exif, style, analysis], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const lesson: Lesson | undefined = lessons[lessonIdx];

  if (!open) {
    return (
      <div className="card" style={{ padding: 14 }}>
        <div className="section-title">🎓 Guided lesson</div>
        <p className="muted" style={{ margin: "0 0 10px", lineHeight: 1.5 }}>
          Let the coach drive your simulator: step-by-step setting changes with narration, built
          from this camera, your style and the photo's analysis.
        </p>
        <button
          className="btn primary small"
          onClick={() => {
            beginUndoable();
            setLessonIdx(0);
            setStepIdx(-1);
            setOpen(true);
          }}
        >
          Start a lesson
        </button>
      </div>
    );
  }

  const step = lesson && stepIdx >= 0 ? lesson.steps[stepIdx] : undefined;
  const finished = !!lesson && stepIdx >= lesson.steps.length;

  const goto = (idx: number) => {
    if (!lesson) return;
    if (idx >= 0 && idx < lesson.steps.length) {
      const s = lesson.steps[idx];
      updateSetting(s.settingId, s.value);
      setHighlight(s.settingId);
    }
    setStepIdx(idx);
  };

  return (
    <div className="card lesson-card" style={{ padding: 14, borderColor: "rgba(48,209,88,0.4)" }}>
      <div className="section-title" style={{ color: "var(--good)" }}>
        🎓 {lesson?.title ?? "Lesson"}
      </div>
      <p className="muted" style={{ margin: "0 0 10px", lineHeight: 1.5 }}>
        {lesson?.description}
      </p>

      {step && (
        <div className="lesson-step">
          <div className="lesson-narration">{step.narration}</div>
          {step.why && <div className="muted" style={{ fontSize: "0.76rem", marginTop: 6 }}>{step.why}</div>}
        </div>
      )}
      {finished && (
        <div className="lesson-step">
          <div className="lesson-narration">
            Lesson complete — compare with the Original toggle. Keep the settings or revert below.
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button className="btn small" disabled={stepIdx <= 0} onClick={() => goto(stepIdx - 1)}>
          ← Back
        </button>
        {!finished ? (
          <button
            className="btn primary small"
            disabled={!lesson || stepIdx >= lesson.steps.length - 1}
            onClick={() => goto(stepIdx + 1)}
          >
            {stepIdx < 0 ? "Step 1 ▸" : `Step ${stepIdx + 2} ▸`}
          </button>
        ) : (
          <span className="chip good">done</span>
        )}
        <div className="spacer" style={{ flex: 1 }} />
        {undoSnapshot && (
          <button className="btn small" onClick={undoApply} title="Restore the settings you had before the lesson">
            ↩ Revert
          </button>
        )}
        <button className="btn small" onClick={() => { setOpen(false); setStepIdx(-1); setHighlight(null); }}>
          Exit
        </button>
      </div>
      <div className="muted" style={{ fontSize: "0.72rem", marginTop: 8 }}>
        {lesson ? `Step ${Math.min(stepIdx + 1, lesson.steps.length)} of ${lesson.steps.length}` : ""}
      </div>
    </div>
  );
}

// --------------------------------------------------------------- chat

function CoachChat() {
  const chatMessages = useStore((s) => s.chatMessages);
  const chatSending = useStore((s) => s.chatSending);
  const chatNotice = useStore((s) => s.chatNotice);
  const askCoach = useStore((s) => s.askCoach);
  const coachMeta = useStore((s) => s.coachMeta);
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [chatMessages, chatSending]);

  const send = () => {
    if (!text.trim() || chatSending) return;
    void askCoach(text);
    setText("");
  };

  return (
    <section className="chat-section">
      <div className="section-title">💬 Ask the coach</div>
      <div className="chat-thread" ref={scrollRef}>
        {chatMessages.length === 0 && (
          <div className="muted" style={{ fontSize: "0.78rem" }}>
            Ask anything: "why is my photo grainy?", "what aperture for blurry backgrounds?",
            "explain shutter speed". Answers come from the built-in knowledge base; connect an AI
            engine on the Setup page for full photo-aware chat.
          </div>
        )}
        {chatMessages.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            {m.text}
          </div>
        ))}
        {chatSending && <div className="chat-msg assistant typing">…</div>}
      </div>
      {chatNotice && <div className="notice" style={{ marginTop: 8 }}>{chatNotice}</div>}
      <div className="chat-input-row">
        <input
          type="text"
          value={text}
          placeholder={
            coachMeta?.provider && coachMeta.provider !== "mock"
              ? "Ask about this photo or any setting…"
              : "Ask about settings or problems…"
          }
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button className="btn primary small" onClick={send} disabled={chatSending || !text.trim()}>
          Send
        </button>
      </div>
    </section>
  );
}

function LogItem({ kind, text, why }: { kind: string; text: string; why?: string }) {
  const [showWhy, setShowWhy] = useState(false);
  return (
    <div className={`log-entry ${kind}`}>
      <div>{text}</div>
      {why && (
        <>
          <button className="why-toggle" onClick={() => setShowWhy((v) => !v)}>
            {showWhy ? "Hide why" : "Why?"}
          </button>
          {showWhy && <div className="why">{why}</div>}
        </>
      )}
    </div>
  );
}

function Note({ k, v }: { k: string; v: string }) {
  return (
    <div className="note">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const filled = (score / 100) * c;
  const color = score >= 75 ? "#30d158" : score >= 50 ? "#ffd60a" : "#ff453a";
  return (
    <div className="score-ring">
      <svg width="84" height="84">
        <circle cx="42" cy="42" r={r} stroke="#2a2e37" strokeWidth="7" fill="none" />
        <circle
          cx="42"
          cy="42"
          r={r}
          stroke={color}
          strokeWidth="7"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c}`}
        />
      </svg>
      <div className="score-num">
        {score}
        <span>/ 100</span>
      </div>
    </div>
  );
}
