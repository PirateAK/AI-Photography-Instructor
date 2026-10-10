// 🎓 Training classes — library grid + course player. Data-driven from
// data/training_courses.json; free teasers ship with the app, paid classes
// unlock via redemption code (MVP stub) or purchase on the store site.
import { useMemo, useState } from "react";
import { useStore } from "../state/store";
import {
  appConfig,
  coursesByCategory,
  embedUrl,
  getCourse,
  isUnlocked,
  totalMinutes,
  type Lesson,
  type TrainingCourse,
} from "../lib/training";

export default function ClassesScreen() {
  const unlockedCourses = useStore((s) => s.unlockedCourses);
  const goUpload = useStore((s) => s.goUpload);
  const openWorkspace = useStore((s) => s.openWorkspace);
  const goStyleManager = useStore((s) => s.goStyleManager);
  const dataUrl = useStore((s) => s.dataUrl);
  const [openId, setOpenId] = useState<string | null>(null);
  const openCourse = openId ? getCourse(openId) : undefined;

  if (openCourse) {
    return (
      <div className="upload-wrap">
        <CourseDetail
          course={openCourse}
          unlocked={isUnlocked(openCourse, unlockedCourses)}
          onBack={() => setOpenId(null)}
        />
      </div>
    );
  }

  return (
    <div className="upload-wrap">
      <div className="upload-hero">
        <h1>🎓 Training classes</h1>
        <p>
          Short, hands-on classes built around the simulator — every lesson ends with a
          <strong> “Try it”</strong> moment that loads the settings into your workspace so you
          learn by doing, not just watching. Fundamentals ship free; specialized tracks unlock
          with purchase.
        </p>
        <div className="upload-row">
          <button className="btn" onClick={dataUrl ? openWorkspace : goUpload}>
            ← {dataUrl ? "Back to workspace" : "Back to upload"}
          </button>
          <button className="btn primary" onClick={goStyleManager}>
            ✎ Manage styles
          </button>
        </div>
      </div>

      {coursesByCategory().map((group) => (
        <section key={group.category} style={{ marginTop: 22 }}>
          <h2 className="category-title">{group.category}</h2>
          <div className="course-grid">
            {group.courses.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                unlocked={isUnlocked(course, unlockedCourses)}
                onOpen={() => setOpenId(course.id)}
              />
            ))}
          </div>
        </section>
      ))}

      <p className="muted" style={{ marginTop: 24, fontSize: "0.8rem" }}>
        Purchases unlock via your store account and a redemption code. Codes are checked on this
        device in the MVP — server-side validation comes with accounts.
      </p>
    </div>
  );
}

function CourseCard({
  course,
  unlocked,
  onOpen,
}: {
  course: TrainingCourse;
  unlocked: boolean;
  onOpen: () => void;
}) {
  return (
    <button className={`course-card card ${unlocked ? "" : "locked"}`} onClick={onOpen}>
      <div className={`course-cover hue-${course.id.length % 5}`}>
        <span>{course.cover_emoji}</span>
        {!unlocked && <span className="lock-badge">🔒</span>}
        <span className={`price-badge ${course.price}`}>{course.price === "free" ? "FREE" : "PURCHASED CLASS"}</span>
      </div>
      <div className="course-meta">
        <h3>{course.title}</h3>
        <p className="muted">{course.tagline}</p>
        <div className="course-stats">
          <span className="chip dim">{course.level}</span>
          <span className="chip dim">
            {course.lessons.length} lessons · {totalMinutes(course)} min
          </span>
        </div>
      </div>
    </button>
  );
}

function CourseDetail({
  course,
  unlocked,
  onBack,
}: {
  course: TrainingCourse;
  unlocked: boolean;
  onBack: () => void;
}) {
  const [activeLesson, setActiveLesson] = useState<Lesson>(course.lessons[0]);
  const practicePreset = useStore((s) => s.practicePreset);
  const unlockWithCode = useStore((s) => s.unlockWithCode);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);

  const tryUnlock = () => {
    if (unlockWithCode(code)) {
      setCodeError(null);
      setCode("");
    } else {
      setCodeError("That code doesn't look right — check your purchase email.");
    }
  };

  return (
    <div className="course-detail">
      <button className="btn small" onClick={onBack}>
        ← All classes
      </button>
      <div className="upload-hero" style={{ marginTop: 14 }}>
        <h1>
          {course.cover_emoji} {course.title}
        </h1>
        <p>
          {course.description}
          <br />
          <span className="chip dim">{course.level}</span>{" "}
          <span className="chip dim">
            {course.lessons.length} lessons · {totalMinutes(course)} min total
          </span>{" "}
          <span className={`chip ${course.price === "free" ? "good" : "medium"}`}>
            {course.price === "free" ? "FREE" : "PURCHASED CLASS"}
          </span>
        </p>
      </div>

      {unlocked ? (
        <div className="player-card card">
          <LessonPlayer lesson={activeLesson} />
          <div className="lesson-list">
            {course.lessons.map((lesson) => (
              <button
                key={lesson.id}
                className={`lesson-row ${lesson.id === activeLesson.id ? "active" : ""}`}
                onClick={() => setActiveLesson(lesson)}
              >
                <span className="play-ico">▶</span>
                <span className="lesson-title">{lesson.title}</span>
                <span className="lesson-dur">{lesson.duration_min} min</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="locked-panel card">
          <div className="locked-hero">
            <span className="locked-emoji">{course.cover_emoji}</span>
            <div>
              <h3>🔒 This class is part of the paid pack</h3>
              <p className="muted" style={{ lineHeight: 1.55 }}>
                {course.lessons.length} lessons · {totalMinutes(course)} minutes · every lesson
                with a hands-on “Try it” drill in the simulator.
              </p>
            </div>
          </div>
          <div className="unlock-actions">
            <button
              className="btn primary"
              onClick={() => window.open(appConfig.store_url, "_blank", "noopener")}
            >
              🛒 {appConfig.store_label}
            </button>
            <span className="muted">— or —</span>
            <div className="code-row">
              <input
                type="text"
                placeholder="redemption code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && tryUnlock()}
              />
              <button className="btn" disabled={!code.trim()} onClick={tryUnlock}>
                Unlock
              </button>
            </div>
          </div>
          {codeError && <div className="notice" style={{ marginTop: 10 }}>{codeError}</div>}
          <p className="muted" style={{ marginTop: 12, fontSize: "0.78rem" }}>
            Already purchased? Your redemption code is in the purchase email.
          </p>
        </div>
      )}
    </div>
  );
}

function LessonPlayer({ lesson }: { lesson: Lesson }) {
  const practicePreset = useStore((s) => s.practicePreset);
  const embed = useMemo(() => embedUrl(lesson.video_url), [lesson.video_url]);

  return (
    <div className="lesson-player">
      {embed ? (
        <div className="video-frame">
          <iframe
            src={embed}
            title={lesson.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video className="video-frame" src={lesson.video_url} controls preload="metadata" />
      )}
      <h3 style={{ margin: "14px 0 6px" }}>{lesson.title}</h3>
      <p className="muted" style={{ marginTop: 0, lineHeight: 1.55 }}>
        {lesson.summary}
      </p>
      {lesson.practice_preset && (
        <div className="practice-box">
          <div className="section-title" style={{ marginBottom: 6 }}>
            🎯 Try it — hands-on drill
          </div>
          <p className="muted" style={{ margin: "0 0 10px", lineHeight: 1.5 }}>
            {lesson.practice_brief}
          </p>
          <div className="rec-row">
            {Object.entries(lesson.practice_preset).map(([k, v]) => (
              <span className="rec-pill" key={k}>
                <span className="k">{k.replace("_", " ")}</span>
                {String(v)}
              </span>
            ))}
          </div>
          <button
            className="btn primary small"
            onClick={() => practicePreset(lesson.practice_preset!, lesson.practice_brief ?? lesson.title)}
          >
            ⚡ Load in simulator
          </button>
        </div>
      )}
    </div>
  );
}
