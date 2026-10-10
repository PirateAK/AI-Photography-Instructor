// ✎ Course Manager — create / edit / delete training courses, draft with AI,
// and download the contributor template. Writes via /api/courses (validated,
// backed up) into data/training_courses.json.
import { useState } from "react";
import { useStore } from "../state/store";
import type { TrainingCourse } from "../lib/training";

interface LessonForm {
  id: string;
  title: string;
  duration_min: string;
  summary: string;
  video_url: string;
  video_kind: "mp4" | "youtube" | "vimeo";
  difficulty: "" | "Beginner" | "Intermediate" | "Advanced";
  aperture: string;
  shutter_speed: string;
  iso: string;
  practice_brief: string;
}

interface CourseForm {
  isNew: boolean;
  id: string;
  category: string;
  title: string;
  cover_emoji: string;
  tagline: string;
  description: string;
  level: string;
  author: string;
  price: "free" | "paid";
  lessons: LessonForm[];
}

const CATEGORIES = ["Fundamentals", "Genre-specific", "Advanced", "Specialized"];
const LEVELS = ["Beginner", "Intermediate", "Advanced", "Beginner → Advanced"];
const DIFFS: LessonForm["difficulty"][] = ["", "Beginner", "Intermediate", "Advanced"];

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50);
}

function blankLesson(courseId: string, n: number): LessonForm {
  return {
    id: `${slugify(courseId) || "lesson"}-${n}`,
    title: "",
    duration_min: "6",
    summary: "",
    video_url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4",
    video_kind: "mp4",
    difficulty: "",
    aperture: "",
    shutter_speed: "",
    iso: "",
    practice_brief: "",
  };
}

function blankForm(): CourseForm {
  return {
    isNew: true,
    id: "",
    category: "Genre-specific",
    title: "",
    cover_emoji: "📸",
    tagline: "",
    description: "",
    level: "Beginner",
    author: "",
    price: "paid",
    lessons: [blankLesson("new", 1)],
  };
}

function fromCourse(c: TrainingCourse, isNew: boolean): CourseForm {
  return {
    isNew,
    id: c.id,
    category: c.category,
    title: c.title,
    cover_emoji: c.cover_emoji,
    tagline: c.tagline,
    description: c.description,
    level: c.level,
    author: c.author ?? "",
    price: c.price,
    lessons: c.lessons.map((l) => ({
      id: l.id,
      title: l.title,
      duration_min: String(l.duration_min),
      summary: l.summary,
      video_url: l.video_url,
      video_kind: l.video_kind,
      difficulty: (l.difficulty ?? "") as LessonForm["difficulty"],
      aperture: l.practice_preset?.aperture !== undefined ? String(l.practice_preset.aperture) : "",
      shutter_speed: l.practice_preset?.shutter_speed !== undefined ? String(l.practice_preset.shutter_speed) : "",
      iso: l.practice_preset?.iso !== undefined ? String(l.practice_preset.iso) : "",
      practice_brief: l.practice_brief ?? "",
    })),
  };
}

function toCourse(f: CourseForm): TrainingCourse {
  const lessons = f.lessons
    .filter((l) => l.title.trim() && l.summary.trim() && l.video_url.trim())
    .map((l, i) => {
      const preset: Record<string, string | number> = {};
      if (l.aperture.trim()) preset.aperture = l.aperture.trim();
      if (l.shutter_speed.trim()) preset.shutter_speed = l.shutter_speed.trim();
      if (l.iso.trim()) preset.iso = l.iso.trim();
      return {
        id: l.id.trim() || `${slugify(f.id) || "lesson"}-${i + 1}`,
        title: l.title.trim(),
        duration_min: Math.max(1, parseInt(l.duration_min, 10) || 6),
        summary: l.summary.trim(),
        video_url: l.video_url.trim(),
        video_kind: l.video_kind,
        ...(l.difficulty ? { difficulty: l.difficulty } : {}),
        ...(Object.keys(preset).length ? { practice_preset: preset } : {}),
        practice_brief: l.practice_brief.trim() || undefined,
      };
    });
  return {
    id: f.id.trim(),
    category: f.category,
    title: f.title.trim(),
    cover_emoji: f.cover_emoji.trim() || "📸",
    tagline: f.tagline.trim(),
    description: f.description.trim(),
    level: f.level,
    author: f.author.trim() || undefined,
    price: f.price,
    lessons,
  } as TrainingCourse;
}

function contributorTemplate(): string {
  return JSON.stringify(
    {
      _instructions:
        "CONTRIBUTOR TEMPLATE — Fill in every field, keep ids unique and snake_case, video_url can be a " +
        "direct MP4 or a YouTube/Vimeo link, difficulty is optional (Beginner/Intermediate/Advanced), and " +
        "practice_preset is optional (camera settings the lesson loads into the simulator). " +
        "Send the finished file to the app owner for review — nothing ships without approval.",
      category: "Genre-specific",
      title: "Your Course Title",
      cover_emoji: "📸",
      tagline: "One-line promise of the course",
      description: "2-3 sentences: who it is for and what they will be able to do afterwards.",
      level: "Beginner",
      author: "Your Name",
      price: "paid",
      lessons: [
        {
          id: "yourcourse-1",
          title: "Lesson one title",
          duration_min: 7,
          summary: "2-3 sentences covering what the lesson teaches.",
          video_url: "https://your-video-host.com/lesson-1.mp4",
          video_kind: "mp4",
          difficulty: "Beginner",
          practice_preset: { aperture: "f/2.8", shutter_speed: "1/250", iso: "400" },
          practice_brief: "The hands-on drill the learner does in the app simulator after watching.",
        },
        {
          id: "yourcourse-2",
          title: "Lesson two title",
          duration_min: 7,
          summary: "...",
          video_url: "https://your-video-host.com/lesson-2.mp4",
          video_kind: "mp4",
        },
      ],
    },
    null,
    2,
  );
}

function downloadTemplate() {
  const blob = new Blob([contributorTemplate()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "contributor-course-template.json";
  a.click();
  URL.revokeObjectURL(url);
}

export default function CourseManagerScreen() {
  const courses = useStore((s) => s.courses);
  const saveCourse = useStore((s) => s.saveCourse);
  const deleteCourse = useStore((s) => s.deleteCourse);
  const draftCourseWithAI = useStore((s) => s.draftCourseWithAI);
  const goClasses = useStore((s) => s.goClasses);

  const [form, setForm] = useState<CourseForm | null>(null);
  const [aiTopic, setAiTopic] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const set = (patch: Partial<CourseForm>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const setLesson = (i: number, patch: Partial<LessonForm>) =>
    setForm((f) => (f ? { ...f, lessons: f.lessons.map((l, j) => (j === i ? { ...l, ...patch } : l)) } : f));

  const save = async () => {
    if (!form) return;
    setBusy("save");
    setError(null);
    setValidationErrors([]);
    try {
      await saveCourse(toCourse(form));
      setNotice(`Saved "${form.title}".`);
      setForm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string, title: string) => {
    if (!window.confirm(`Delete course "${title}"? A backup of the catalog is kept.`)) return;
    setBusy(id);
    setError(null);
    try {
      await deleteCourse(id);
      setNotice(`Deleted "${title}".`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(null);
    }
  };

  const draft = async () => {
    if (!aiTopic.trim()) return;
    setBusy("ai");
    setError(null);
    setValidationErrors([]);
    try {
      const d = await draftCourseWithAI(aiTopic.trim());
      setForm(fromCourse(d, true));
      setAiTopic("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI draft failed");
    } finally {
      setBusy(null);
    }
  };

  if (form) {
    return (
      <div className="upload-wrap">
        <h1 style={{ letterSpacing: "-0.02em" }}>{form.isNew ? "New course" : `Edit: ${form.title}`}</h1>
        {error && <div className="coach-error" style={{ padding: 12, marginBottom: 12 }}>{error}</div>}
        {validationErrors.length > 0 && (
          <div className="notice" style={{ marginBottom: 12 }}>
            AI draft needs attention: {validationErrors.join(" · ")} — fix before saving.
          </div>
        )}
        <div className="card settings-form" style={{ padding: 20 }}>
          <div className="form-grid">
            <label>Title<input value={form.title} onChange={(e) => set({ title: e.target.value, id: form.isNew ? slugify(e.target.value) : form.id })} placeholder="Night Photography Masterclass" /></label>
            <label>Emoji<input value={form.cover_emoji} onChange={(e) => set({ cover_emoji: e.target.value })} /></label>
            <label>
              ID (snake_case, permanent)
              <input value={form.id} disabled={!form.isNew} onChange={(e) => set({ id: e.target.value })} />
            </label>
            <label>
              Category
              <select value={form.category} onChange={(e) => set({ category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label>
              Level
              <select value={form.level} onChange={(e) => set({ level: e.target.value })}>
                {LEVELS.map((l) => <option key={l}>{l}</option>)}
              </select>
            </label>
            <label>
              Price
              <select value={form.price} onChange={(e) => set({ price: e.target.value as "free" | "paid" })}>
                <option value="free">Free (teaser)</option>
                <option value="paid">Paid</option>
              </select>
            </label>
            <label>Author (credit)<input value={form.author} onChange={(e) => set({ author: e.target.value })} placeholder="Photographer name" /></label>
          </div>
          <label>Tagline<input value={form.tagline} onChange={(e) => set({ tagline: e.target.value })} /></label>
          <label>Description<textarea rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} /></label>

          <div className="section-title">Lessons ({form.lessons.length})</div>
          {form.lessons.map((l, i) => (
            <div className="card" key={i} style={{ padding: 12, display: "grid", gap: 8 }}>
              <div className="form-grid">
                <label>Title<input value={l.title} onChange={(e) => setLesson(i, { title: e.target.value })} /></label>
                <label>Minutes<input type="number" min="1" max="180" value={l.duration_min} onChange={(e) => setLesson(i, { duration_min: e.target.value })} /></label>
                <label>
                  Difficulty (blank = course level)
                  <select value={l.difficulty} onChange={(e) => setLesson(i, { difficulty: e.target.value as LessonForm["difficulty"] })}>
                    {DIFFS.map((d) => <option key={d} value={d}>{d || "auto"}</option>)}
                  </select>
                </label>
                <label>
                  Video type
                  <select value={l.video_kind} onChange={(e) => setLesson(i, { video_kind: e.target.value as LessonForm["video_kind"] })}>
                    <option value="mp4">MP4</option>
                    <option value="youtube">YouTube</option>
                    <option value="vimeo">Vimeo</option>
                  </select>
                </label>
              </div>
              <label>Video URL<input value={l.video_url} onChange={(e) => setLesson(i, { video_url: e.target.value })} /></label>
              <label>Summary<textarea rows={2} value={l.summary} onChange={(e) => setLesson(i, { summary: e.target.value })} /></label>
              <div className="section-title" style={{ margin: 0 }}>“Try it” drill (optional)</div>
              <div className="form-grid form-grid-4">
                <label>Aperture<input value={l.aperture} onChange={(e) => setLesson(i, { aperture: e.target.value })} placeholder="f/2.8" /></label>
                <label>Shutter<input value={l.shutter_speed} onChange={(e) => setLesson(i, { shutter_speed: e.target.value })} placeholder="1/250" /></label>
                <label>ISO<input value={l.iso} onChange={(e) => setLesson(i, { iso: e.target.value })} placeholder="400" /></label>
              </div>
              <label>Drill brief<textarea rows={2} value={l.practice_brief} onChange={(e) => setLesson(i, { practice_brief: e.target.value })} /></label>
              {form.lessons.length > 1 && (
                <button className="btn small" onClick={() => set({ lessons: form.lessons.filter((_, j) => j !== i) })}>
                  Remove lesson
                </button>
              )}
            </div>
          ))}
          <button className="btn small" onClick={() => set({ lessons: [...form.lessons, blankLesson(form.id || "new", form.lessons.length + 1)] })}>
            ＋ Add lesson
          </button>

          <div className="upload-row" style={{ marginTop: 8 }}>
            <button className="btn primary" disabled={busy !== null} onClick={save}>
              {busy === "save" ? "Saving…" : "💾 Save course"}
            </button>
            <button className="btn" onClick={() => setForm(null)} disabled={busy !== null}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="upload-wrap">
      <div className="upload-hero">
        <h1>✎ Course manager</h1>
        <p>
          Training courses power the Classes screen and the redemption unlock. Changes write into{" "}
          <code>data/training_courses.json</code> (a timestamped backup is kept) and apply instantly.
        </p>
        <div className="upload-row">
          <button className="btn" onClick={goClasses}>← Back to classes</button>
          <button className="btn primary" onClick={() => setForm(blankForm())}>＋ New course</button>
          <button className="btn" onClick={downloadTemplate} title="JSON scaffold for contributors to fill in">
            ⬇ Contributor template
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div className="section-title">✨ Draft a course with AI</div>
        <div className="code-row" style={{ maxWidth: 520 }}>
          <input
            type="text"
            value={aiTopic}
            placeholder='topic, e.g. "Landscape masterclass" or "Wedding second-shooter course"'
            onChange={(e) => setAiTopic(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && draft()}
          />
          <button className="btn primary" disabled={!aiTopic.trim() || busy !== null} onClick={draft}>
            {busy === "ai" ? "Drafting…" : "Draft"}
          </button>
        </div>
        <p className="muted" style={{ marginTop: 8, fontSize: "0.78rem" }}>
          Uses the connected AI engine to design the full course — lessons, summaries, difficulties
          and simulator drills — for your review before saving.
        </p>
      </div>

      {error && <div className="coach-error" style={{ padding: 12, marginBottom: 12 }}>{error}</div>}
      {notice && <div className="notice" style={{ marginBottom: 12 }}>{notice}</div>}

      <div className="course-grid">
        {courses.map((c) => (
          <div className="card course-card" key={c.id} style={{ cursor: "default" }}>
            <div className={`course-cover hue-${c.id.length % 5}`}>
              <span>{c.cover_emoji}</span>
              <span className={`price-badge ${c.price}`}>{c.price === "free" ? "FREE" : "PAID"}</span>
            </div>
            <div className="course-meta">
              <h3>{c.title}</h3>
              <p className="muted">{c.tagline}</p>
              <div className="muted" style={{ fontSize: "0.72rem" }}>
                {c.category} · {c.lessons.length} lessons{c.author ? ` · by ${c.author}` : ""}
              </div>
              <div className="upload-row" style={{ marginTop: 6 }}>
                <button className="btn small" onClick={() => setForm(fromCourse(c, false))}>✎ Edit</button>
                <button className="btn small" disabled={busy !== null || courses.length <= 1} onClick={() => remove(c.id, c.title)}>
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
