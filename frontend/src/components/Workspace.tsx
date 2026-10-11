import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { getCamera } from "../lib/camera";
import { activeHolidayWindow } from "../lib/holidays";
import ImageViewer from "./ImageViewer";
import CameraBody from "./camera_body/CameraBody";
import CameraToolbar from "./CameraToolbar";
import CoachPanel from "./CoachPanel";
import HistogramGuide from "./HistogramGuide";
import GalleryPanel from "./GalleryPanel";
import ModelSelector from "./ModelSelector";

export default function Workspace() {
  const goUpload = useStore((s) => s.goUpload);
  const goClasses = useStore((s) => s.goClasses);
  const goProgress = useStore((s) => s.goProgress);
  const dataUrl = useStore((s) => s.dataUrl);
  const beginner = useStore((s) => s.beginner);
  const setBeginner = useStore((s) => s.setBeginner);
  const resetSettings = useStore((s) => s.resetSettings);
  const styleId = useStore((s) => s.styleId);
  const setStyle = useStore((s) => s.setStyle);
  const cameraId = useStore((s) => s.cameraId);
  const styles = useStore((s) => s.styles);
  const [tab, setTab] = useState<"preview" | "body">("preview");
  const [histGuide, setHistGuide] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const contentBlocked = useStore((s) => s.contentBlocked);
  const galleryCount = useStore((s) => s.galleryItems.length);
  const instructorUnlocked = useStore((s) => s.instructorUnlocked);
  const goSettings = useStore((s) => s.goSettings);

  useEffect(() => {
    if (!dataUrl) goUpload();
  }, [dataUrl, goUpload]);

  if (!dataUrl) return null;

  return (
    <div className="workspace">
      <header className="app-header">
        <button className="btn small ghost" onClick={goUpload} title="Back to the start screen — your photo and settings stay loaded">
          🏠 Home
        </button>
        <div className="title">📷 Photo Coach</div>
        <select
          aria-label="Photography style"
          value={styleId}
          onChange={(e) => setStyle(e.target.value)}
          style={{
            background: "var(--bg-elev2)",
            border: "1px solid var(--border)",
            color: "var(--text)",
            borderRadius: 9,
            padding: "6px 10px",
            fontSize: "0.85rem",
          }}
        >
          <option value="">Style: general</option>
          {styles.map((st) => (
            <option key={st.id} value={st.id}>
              {st.emoji} {st.label}
            </option>
          ))}
        </select>
        <div className="spacer" />
        <ModelSelector compact />
        <div className="brand-toggle" title="Explain controls in beginner terms">
          <button className={beginner ? "active" : ""} onClick={() => setBeginner(true)}>
            Beginner
          </button>
          <button className={!beginner ? "active" : ""} onClick={() => setBeginner(false)}>
            Pro
          </button>
        </div>
        <button className="btn small" onClick={resetSettings} title="Reset settings to this camera's defaults">
          Reset
        </button>
        {instructorUnlocked && (
          <button className="btn small" onClick={goSettings} title="Coach engine setup (instructor)">
            ⚙ Setup
          </button>
        )}
        <button className="btn small" onClick={goClasses} title="Training classes">
          🎓 Classes
        </button>
        <button
          className="btn small"
          onClick={() => setGalleryOpen((v) => !v)}
          aria-expanded={galleryOpen}
          title="Swap photos from your on-device gallery without leaving the coach"
        >
          🖼️{galleryCount > 0 ? ` ${galleryCount}` : ""}
        </button>
        <button className="btn small" onClick={goProgress} title="Your saved analyses and progress">
          📈 Progress
        </button>
      </header>

      <div className="workspace-main">
        <div className="image-pane">
          <div className="ab-toggle" role="tablist" aria-label="Left panel">
            <button className={tab === "preview" ? "active" : ""} onClick={() => setTab("preview")}>
              🖼 Preview
            </button>
            <button className={tab === "body" ? "active" : ""} onClick={() => setTab("body")}>
              📷 Camera body
            </button>
          </div>
          {contentBlocked ? (
            <div className="blocked-notice" role="alert">
              <div className="blocked-emoji" aria-hidden="true">🚫</div>
              <h3>Photo blocked by the content review</h3>
              <p>
                This photo violates the app's content terms (adult or illegal content), so it
                can't be coached, saved, or shared. Nothing was stored — the photo stays on this
                device only.
              </p>
              <p className="muted">Full terms: home screen → About → Content terms.</p>
              <button className="btn primary" onClick={goUpload}>
                ← Back to home
              </button>
            </div>
          ) : !dataUrl ? (
            <EmptyPhotoCard holidayActive={!!activeHolidayWindow()} onOpenGallery={() => setGalleryOpen(true)} />
          ) : tab === "preview" ? (
            <ImageViewer onToggleHistGuide={() => setHistGuide((v) => !v)} />
          ) : (
            <CameraBody cam={getCamera(cameraId)!} />
          )}
          {galleryOpen && (
            <div className="gallery-overlay">
              <div className="gallery-overlay-head">
                <strong>🖼️ Gallery — tap a photo to swap it into the coach</strong>
                <button className="btn small ghost" onClick={() => setGalleryOpen(false)}>
                  ✕ Close
                </button>
              </div>
              <GalleryPanel onClose={() => setGalleryOpen(false)} showClose={false} autoAnalyze />
            </div>
          )}
        </div>
        <aside className={`coach-pane ${histGuide ? "guide-open" : ""}`}>
          <CoachPanel />
          {histGuide && <HistogramGuide onClose={() => setHistGuide(false)} />}
        </aside>
      </div>

      <CameraToolbar />
    </div>
  );
}

/** Empty image pane — the banner can open the coach before any photo is loaded
 * (holiday challenge flow). Offers add-photo / gallery instead of a dead viewer. */
function EmptyPhotoCard({
  holidayActive,
  onOpenGallery,
}: {
  holidayActive: boolean;
  onOpenGallery: () => void;
}) {
  const loadFile = useStore((s) => s.loadFile);
  const startAnalysis = useStore((s) => s.startAnalysis);
  const inputRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);

  const holiday = holidayActive ? activeHolidayWindow()!.holiday : null;

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\/(jpeg|png)$/.test(file.type)) {
      alert("Please choose a JPG or PNG image.");
      return;
    }
    setReading(true);
    try {
      await loadFile(file);
      startAnalysis(); // straight into the coach, same as a gallery pick
    } finally {
      setReading(false);
    }
  };

  return (
    <div className="empty-photo-card" role="status">
      <div className="empty-photo-emoji" aria-hidden="true">
        {holiday ? holiday.emoji : "🖼️"}
      </div>
      <h3>{holiday ? `${holiday.name} challenge — bring your shot` : "Load a photo to get coached"}</h3>
      <p className="muted">
        {holiday
          ? `Shoot for “${holiday.challenge.title}”, then add your photo here — the coach grades it against the goal.`
          : "Add a photo and the coach will grade exposure, focus and composition."}
      </p>
      <div className="holiday-actions" style={{ justifyContent: "center" }}>
        <button className="btn primary" disabled={reading} onClick={() => inputRef.current?.click()}>
          {reading ? "Loading…" : "📷 Add your photo"}
        </button>
        <button className="btn" onClick={onOpenGallery}>
          🖼️ Gallery
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        hidden
        onChange={(e) => void onFile(e)}
      />
    </div>
  );
}
