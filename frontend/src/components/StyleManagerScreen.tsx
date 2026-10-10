// ✎ Style Manager — add / edit / delete photography styles, or draft new ones
// with the connected AI engine. Writes go through /api/styles (validated,
// backed up) into data/shooting_styles.json — the single source of truth.
import { useState } from "react";
import { useStore } from "../state/store";
import type { ShootingStyle, StyleLesson, StyleLessonStep } from "../lib/styles";

interface StyleForm {
  isNew: boolean;
  id: string;
  label: string;
  emoji: string;
  description: string;
  level: string;
  recipeSummary: string;
  recipeWhy: string;
  aperture: string;
  shutter_speed: string;
  iso: string;
  exposure_comp: string;
  shutter_floor: string;
  aperture_target: string;
  iso_max: string;
  allow_slow_shutter: boolean;
  priorities: Record<string, string>;
  watchForsText: string;
  exercises: { title: string; goal: string; how: string }[];
  lessons: StyleLesson[];
}

const PRIORITY_KEYS = ["highlights", "shadows", "exposure", "color_cast", "noise", "sharpness"] as const;
const STEP_SETTINGS = ["iso", "aperture", "shutter_speed", "white_balance", "exposure_comp", "picture_style", "focus_mode", "metering_mode"] as const;

function fromStyle(style: ShootingStyle, isNew: boolean): StyleForm {
  const s = style.recipe.settings;
  return {
    isNew,
    id: style.id,
    label: style.label,
    emoji: style.emoji,
    description: style.description,
    level: style.level ?? "Beginner",
    recipeSummary: style.recipe.summary,
    recipeWhy: style.recipe.why,
    aperture: String(s.aperture ?? ""),
    shutter_speed: String(s.shutter_speed ?? ""),
    iso: String(s.iso ?? ""),
    exposure_comp: s.exposure_comp !== undefined ? String(s.exposure_comp) : "",
    shutter_floor: style.rules?.shutter_floor ?? "",
    aperture_target: style.rules?.aperture_target ?? "",
    iso_max: style.rules?.iso_max !== undefined && style.rules?.iso_max !== null ? String(style.rules.iso_max) : "",
    allow_slow_shutter: style.rules?.allow_slow_shutter ?? false,
    priorities: Object.fromEntries(PRIORITY_KEYS.map((k) => [k, String(style.priorities?.[k] ?? 1)])),
    watchForsText: (style.watch_fors ?? []).join("\n"),
    exercises: (style.exercises ?? []).slice(0, 3).map((e) => ({ ...e })),
    lessons: (style.lessons ?? []).map((l) => ({ ...l, steps: l.steps.map((st) => ({ ...st })) })),
  };
}

function blankForm(): StyleForm {
  return {
    isNew: true,
    id: "",
    label: "",
    emoji: "📸",
    description: "",
    level: "Beginner",
    recipeSummary: "",
    recipeWhy: "",
    aperture: "",
    shutter_speed: "",
    iso: "",
    exposure_comp: "",
    shutter_floor: "",
    aperture_target: "",
    iso_max: "",
    allow_slow_shutter: false,
    priorities: Object.fromEntries(PRIORITY_KEYS.map((k) => [k, "1"])),
    watchForsText: "",
    exercises: [
      { title: "", goal: "", how: "" },
      { title: "", goal: "", how: "" },
    ],
    lessons: [],
  };
}

function toStyle(f: StyleForm): ShootingStyle {
  const priorities: Record<string, number> = {};
  for (const k of PRIORITY_KEYS) {
    const v = parseFloat(f.priorities[k]);
    if (!Number.isNaN(v)) priorities[k] = v;
  }
  const rules: ShootingStyle["rules"] = { allow_slow_shutter: f.allow_slow_shutter };
  if (f.shutter_floor.trim()) rules.shutter_floor = f.shutter_floor.trim();
  if (f.aperture_target.trim()) rules.aperture_target = f.aperture_target.trim();
  if (f.iso_max.trim()) rules.iso_max = parseFloat(f.iso_max);
  const settings: Record<string, string | number> = {};
  if (f.aperture.trim()) settings.aperture = f.aperture.trim();
  if (f.shutter_speed.trim()) settings.shutter_speed = f.shutter_speed.trim();
  if (f.iso.trim()) settings.iso = f.iso.trim();
  if (f.exposure_comp.trim()) settings.exposure_comp = parseFloat(f.exposure_comp);
  return {
    id: f.id.trim(),
    label: f.label.trim(),
    emoji: f.emoji.trim() || "📸",
    description: f.description.trim(),
    level: f.level,
    recipe: { summary: f.recipeSummary.trim(), settings, why: f.recipeWhy.trim() },
    priorities,
    rules,
    watch_fors: f.watchForsText.split("\n").map((s) => s.trim()).filter(Boolean),
    exercises: f.exercises.filter((e) => e.title.trim() && e.goal.trim() && e.how.trim()),
    // empty list -> omit the key entirely so the JSON stays clean
    ...(f.lessons.some((l) => l.title.trim() && l.steps.length) ? { lessons: f.lessons.filter((l) => l.title.trim() && l.steps.length) } : {}),
  };
}

export default function StyleManagerScreen() {
  const styles = useStore((s) => s.styles);
  const saveStyle = useStore((s) => s.saveStyle);
  const deleteStyle = useStore((s) => s.deleteStyle);
  const draftStyleWithAI = useStore((s) => s.draftStyleWithAI);
  const generateStyleLessons = useStore((s) => s.generateStyleLessons);
  const goClasses = useStore((s) => s.goClasses);
  const activeEngine = useStore((s) => s.coachMeta?.provider);

  const [form, setForm] = useState<StyleForm | null>(null);
  const [aiName, setAiName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const set = (patch: Partial<StyleForm>) => setForm((f) => (f ? { ...f, ...patch } : f));

  const save = async () => {
    if (!form) return;
    setBusy("save");
    setError(null);
    try {
      await saveStyle(toStyle(form));
      setNotice(`Saved "${form.label}".`);
      setForm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string, label: string) => {
    if (!window.confirm(`Delete style "${label}"? This rewrites shooting_styles.json (a backup is kept).`)) return;
    setBusy(id);
    setError(null);
    try {
      await deleteStyle(id);
      setNotice(`Deleted "${label}".`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(null);
    }
  };

  const draft = async () => {
    if (!aiName.trim()) return;
    setBusy("ai");
    setError(null);
    try {
      const d = await draftStyleWithAI(aiName.trim());
      setForm(fromStyle(d, true));
      setAiName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI draft failed");
    } finally {
      setBusy(null);
    }
  };

  const genLessons = async () => {
    if (!form?.id.trim()) return;
    setBusy("ai-lessons");
    setError(null);
    try {
      const { draft_lessons, validation_errors } = await generateStyleLessons(form.id.trim());
      setForm((f) => {
        if (!f) return f;
        const approved = f.lessons.filter((l) => !l.draft);
        return { ...f, lessons: [...approved, ...draft_lessons] };
      });
      if (validation_errors.length) {
        setError(`AI draft had shape issues — review below or regenerate: ${validation_errors.join("; ")}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI lesson generation failed");
    } finally {
      setBusy(null);
    }
  };

  const setLesson = (i: number, patch: Partial<StyleLesson>) =>
    setForm((f) => (f ? { ...f, lessons: f.lessons.map((l, j) => (j === i ? { ...l, ...patch } : l)) } : f));
  const setStep = (li: number, si: number, patch: Partial<StyleLessonStep>) =>
    setForm((f) =>
      f
        ? {
            ...f,
            lessons: f.lessons.map((l, j) =>
              j === li ? { ...l, steps: l.steps.map((st, k) => (k === si ? { ...st, ...patch } : st)) } : l,
            ),
          }
        : f,
    );

  if (form) {
    return (
      <div className="upload-wrap">
        <h1 style={{ letterSpacing: "-0.02em" }}>{form.isNew ? "New style" : `Edit: ${form.label}`}</h1>
        {error && <div className="coach-error" style={{ padding: 12, marginBottom: 12 }}>{error}</div>}
        <div className="card settings-form" style={{ padding: 20 }}>
          <div className="form-grid">
            <label>Label<input value={form.label} onChange={(e) => set({ label: e.target.value })} placeholder="Macro" /></label>
            <label>Emoji<input value={form.emoji} onChange={(e) => set({ emoji: e.target.value })} /></label>
            <label>
              ID (snake_case, permanent)
              <input value={form.id} disabled={!form.isNew} onChange={(e) => set({ id: e.target.value })} placeholder="macro" />
            </label>
            <label>
              Level
              <select value={form.level} onChange={(e) => set({ level: e.target.value })}>
                {["Beginner", "Intermediate", "Advanced"].map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </label>
          </div>
          <label>Description<input value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="Close-up photography of tiny subjects" /></label>

          <div className="section-title">Starting recipe</div>
          <label>Summary<input value={form.recipeSummary} onChange={(e) => set({ recipeSummary: e.target.value })} placeholder="Stop down for maximum depth of field on tiny subjects" /></label>
          <div className="form-grid form-grid-4">
            <label>Aperture<input value={form.aperture} onChange={(e) => set({ aperture: e.target.value })} placeholder="f/8.0" /></label>
            <label>Shutter<input value={form.shutter_speed} onChange={(e) => set({ shutter_speed: e.target.value })} placeholder="1/125" /></label>
            <label>ISO<input value={form.iso} onChange={(e) => set({ iso: e.target.value })} placeholder="200" /></label>
            <label>EV comp (optional)<input value={form.exposure_comp} onChange={(e) => set({ exposure_comp: e.target.value })} placeholder="0" /></label>
          </div>
          <label>Why these settings<textarea rows={3} value={form.recipeWhy} onChange={(e) => set({ recipeWhy: e.target.value })} /></label>

          <div className="section-title">Coach nudges (optional — blank = off)</div>
          <div className="form-grid form-grid-4">
            <label>Shutter floor<input value={form.shutter_floor} onChange={(e) => set({ shutter_floor: e.target.value })} placeholder="1/500" /></label>
            <label>Aperture target<input value={form.aperture_target} onChange={(e) => set({ aperture_target: e.target.value })} placeholder="f/2.8" /></label>
            <label>ISO max<input value={form.iso_max} onChange={(e) => set({ iso_max: e.target.value })} placeholder="1600" /></label>
            <label className="check-row" style={{ alignSelf: "end" }}>
              <input type="checkbox" checked={form.allow_slow_shutter} onChange={(e) => set({ allow_slow_shutter: e.target.checked })} />
              Tripod / slow shutter OK
            </label>
          </div>

          <div className="section-title">Diagnostic weights (0.1 – 3.0)</div>
          <div className="form-grid form-grid-6">
            {PRIORITY_KEYS.map((k) => (
              <label key={k}>
                {k.replace("_", " ")}
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="3"
                  value={form.priorities[k]}
                  onChange={(e) => set({ priorities: { ...form.priorities, [k]: e.target.value } })}
                />
              </label>
            ))}
          </div>

          <div className="section-title">Watch out for (one per line)</div>
          <textarea rows={3} value={form.watchForsText} onChange={(e) => set({ watchForsText: e.target.value })} />

          <div className="section-title">Practice drills (2–3, all fields required)</div>
          {form.exercises.map((ex, i) => (
            <div className="card" key={i} style={{ padding: 12, display: "grid", gap: 8 }}>
              <label>Title<input value={ex.title} onChange={(e) => set({ exercises: form.exercises.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} /></label>
              <label>Goal<input value={ex.goal} onChange={(e) => set({ exercises: form.exercises.map((x, j) => (j === i ? { ...x, goal: e.target.value } : x)) })} /></label>
              <label>How<textarea rows={2} value={ex.how} onChange={(e) => set({ exercises: form.exercises.map((x, j) => (j === i ? { ...x, how: e.target.value } : x)) })} /></label>
              {form.exercises.length > 2 && (
                <button className="btn small" onClick={() => set({ exercises: form.exercises.filter((_, j) => j !== i) })}>
                  Remove drill
                </button>
              )}
            </div>
          ))}
          {form.exercises.length < 3 && (
            <button className="btn small" onClick={() => set({ exercises: [...form.exercises, { title: "", goal: "", how: "" }] })}>
              ＋ Add drill
            </button>
          )}

          <div className="section-title" style={{ marginTop: 8 }}>
            Guided lessons (optional — appear in the coach pane for this style)
          </div>
          <div className="upload-row" style={{ marginTop: 0 }}>
            <button
              className="btn small"
              onClick={genLessons}
              disabled={busy !== null || form.isNew || !form.id.trim()}
              title={
                form.isNew || !form.id.trim()
                  ? "Save the style first — the AI drafts lessons for a saved style"
                  : `Draft 2-3 interactive lessons for ${form.label || "this style"} with AI`
              }
            >
              {busy === "ai-lessons" ? "Drafting…" : "✨ Generate lessons with AI"}
            </button>
            {form.lessons.some((l) => l.draft) && (
              <span className="draft-chip">AI drafts below — approve each, then Save</span>
            )}
          </div>
          {form.lessons.map((lesson, li) => (
            <div className={`card lesson-card ${lesson.draft ? "is-draft" : ""}`} key={`${lesson.id}-${li}`} style={{ padding: 12, display: "grid", gap: 8 }}>
              <div className="upload-row" style={{ marginBottom: 0 }}>
                {lesson.draft ? <span className="draft-chip">AI draft</span> : <span className="draft-chip approved">✓ approved</span>}
                <div className="spacer" />
                {lesson.draft && (
                  <button className="btn small" onClick={() => setLesson(li, { draft: false })} title="Make this lesson visible to learners (then Save)">
                    ✓ Approve
                  </button>
                )}
                <button className="btn small" onClick={() => set({ lessons: form.lessons.filter((_, j) => j !== li) })}>
                  Remove
                </button>
              </div>
              <div className="form-grid form-grid-4">
                <label>Title<input value={lesson.title} onChange={(e) => setLesson(li, { title: e.target.value })} /></label>
                <label>Lesson id<input value={lesson.id} onChange={(e) => setLesson(li, { id: e.target.value })} /></label>
              </div>
              <label>Description<input value={lesson.description} onChange={(e) => setLesson(li, { description: e.target.value })} /></label>
              {lesson.steps.map((step, si) => (
                <div className="lesson-step" key={si}>
                  <div className="form-grid form-grid-4">
                    <label>
                      Setting
                      <select value={step.settingId} onChange={(e) => setStep(li, si, { settingId: e.target.value })}>
                        {STEP_SETTINGS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>Value<input value={String(step.value)} onChange={(e) => setStep(li, si, { value: e.target.value })} /></label>
                  </div>
                  <label>Narration<textarea rows={2} value={step.narration} onChange={(e) => setStep(li, si, { narration: e.target.value })} /></label>
                  <button
                    className="btn small ghost"
                    onClick={() => setLesson(li, { steps: lesson.steps.filter((_, k) => k !== si) })}
                    disabled={lesson.steps.length <= 1}
                  >
                    Remove step
                  </button>
                </div>
              ))}
              {lesson.steps.length < 6 && (
                <button
                  className="btn small"
                  onClick={() => setLesson(li, { steps: [...lesson.steps, { settingId: "aperture", value: "f/5.6", narration: "" }] })}
                >
                  ＋ Add step
                </button>
              )}
              <label>Practice brief<input value={lesson.practice_brief ?? ""} onChange={(e) => setLesson(li, { practice_brief: e.target.value })} /></label>
            </div>
          ))}

          <div className="upload-row" style={{ marginTop: 8 }}>
            <button className="btn primary" disabled={busy !== null} onClick={save}>
              {busy === "save" ? "Saving…" : "💾 Save style"}
            </button>
            <button className="btn" onClick={() => setForm(null)} disabled={busy !== null}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="upload-wrap">
      <div className="upload-hero">
        <h1>✎ Style manager</h1>
        <p>
          Photography styles drive the selector, the coach's recipes and drills. Changes write
          straight into <code>data/shooting_styles.json</code> (a timestamped backup is kept) and
          apply everywhere instantly.
        </p>
        <div className="upload-row">
          <button className="btn" onClick={goClasses}>← Back to classes</button>
          <button className="btn primary" onClick={() => setForm(blankForm())}>＋ New style</button>
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div className="section-title">✨ Draft a new style with AI</div>
        <div className="code-row" style={{ maxWidth: 460 }}>
          <input
            type="text"
            value={aiName}
            placeholder='genre name, e.g. "Macro" or "Underwater"'
            onChange={(e) => setAiName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && draft()}
          />
          <button className="btn primary" disabled={!aiName.trim() || busy !== null} onClick={draft}>
            {busy === "ai" ? "Drafting…" : "Draft"}
          </button>
        </div>
        <p className="muted" style={{ marginTop: 8, fontSize: "0.78rem" }}>
          Uses the connected AI engine ({activeEngine ?? "see Setup"}) to write a full draft —
          recipe, rules, watch-fors and drills — which you review and edit before saving.
        </p>
      </div>

      {error && <div className="coach-error" style={{ padding: 12, marginBottom: 12 }}>{error}</div>}
      {notice && <div className="notice" style={{ marginBottom: 12 }}>{notice}</div>}

      <div className="course-grid">
        {styles.map((s) => (
          <div className="card course-card" key={s.id} style={{ cursor: "default" }}>
            <div className={`course-cover hue-${s.id.length % 5}`}>
              <span>{s.emoji}</span>
              <span className="price-badge free">{s.level}</span>
            </div>
            <div className="course-meta">
              <h3>{s.label}</h3>
              <p className="muted">{s.description}</p>
              <div className="upload-row" style={{ marginTop: 6 }}>
                <button className="btn small" onClick={() => setForm(fromStyle(s, false))}>✎ Edit</button>
                <button
                  className="btn small"
                  disabled={busy !== null || styles.length <= 1}
                  onClick={() => remove(s.id, s.label)}
                >
                  🗑 Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
