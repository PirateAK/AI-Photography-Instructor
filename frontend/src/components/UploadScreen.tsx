import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { getCameras } from "../lib/camera";
import { isInstructorCode } from "../lib/training";
import { chunkRows, orderedStylesForWheel } from "../lib/styles";
import type { ShootingStyle } from "../lib/styles";
import ModelSelector from "./ModelSelector";
import GalleryPanel from "./GalleryPanel";
import pkg from "../../package.json";
import { shareApp as appShare, buildAppShareMessage } from "../lib/share";
import { activeHolidayWindow, contestSchedule, HOLIDAYS } from "../lib/holidays";

const WHEEL_ROW_SIZE = 5;
const RELEASE_DATE = "October 2026";

export default function UploadScreen() {
  const loadFile = useStore((s) => s.loadFile);
  const dataUrl = useStore((s) => s.dataUrl);
  const exif = useStore((s) => s.exif);
  const intent = useStore((s) => s.intent);
  const setIntent = useStore((s) => s.setIntent);
  const instructorUnlocked = useStore((s) => s.instructorUnlocked);
  const unlockInstructor = useStore((s) => s.unlockInstructor);
  const goInstructor = useStore((s) => s.goInstructor);
  const styleId = useStore((s) => s.styleId);
  const setStyle = useStore((s) => s.setStyle);
  const goSettings = useStore((s) => s.goSettings);
  const goClasses = useStore((s) => s.goClasses);
  const goProgress = useStore((s) => s.goProgress);
  const loadDemoPhoto = useStore((s) => s.loadDemoPhoto);
  const openWorkspace = useStore((s) => s.openWorkspace);
  const galleryItems = useStore((s) => s.galleryItems);
  const startAnalysis = useStore((s) => s.startAnalysis);
  const cameras = getCameras();
  const styles = useStore((s) => s.styles);
  const holidayWindow = activeHolidayWindow();
  const goChallenge = useStore((s) => s.goChallenge);
  const contestLive = HOLIDAYS.map((h) => ({ h, phase: contestSchedule(h).phase })).find(
    (x) => x.phase === "submitting" || x.phase === "voting" || x.phase === "results",
  );

  const [dragging, setDragging] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!/^image\/(jpeg|png)$/.test(file.type)) {
      alert("Please choose a JPG or PNG image.");
      return;
    }
    await loadFile(file);
  };

  const hasImage = !!dataUrl;

  return (
    <div className="upload-wrap">
      <div className="upload-hero">
        <div className="hero-title-row">
          <h1>📷 AI Photography Instructor</h1>
          <AboutMenu />
        </div>
        <p>
          Upload a photo and the Photo Coach will evaluate exposure, focus, color and composition —
          then teach you the exact camera settings to try next, with a live simulator to see the
          difference.
        </p>
      </div>

      <div
        className={`dropzone ${dragging ? "drag" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void onFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
      >
        <div className="big">🖼️</div>
        {hasImage ? (
          <>Image loaded — drop another to replace, or click to browse.</>
        ) : (
          <>
            Drag &amp; drop a <strong>JPG / PNG</strong> here, or{" "}
            <span className="browse">browse files</span>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png"
          hidden
          onChange={(e) => void onFiles(e.target.files)}
        />
      </div>

      {hasImage && (
        <div className="upload-preview card" style={{ padding: 14 }}>
          <img src={dataUrl} alt="upload preview" />
          <div className="exif-grid">
            {exif?.has_exif ? (
              <>
                <div>
                  <div className="k">Camera</div>
                  <div className="v">{[exif.camera_make, exif.camera_model].filter(Boolean).join(" ") || "—"}</div>
                </div>
                <div>
                  <div className="k">ISO</div>
                  <div className="v">{exif.iso ?? "—"}</div>
                </div>
                <div>
                  <div className="k">Shutter</div>
                  <div className="v">{exif.shutter_speed ?? "—"}</div>
                </div>
                <div>
                  <div className="k">Aperture</div>
                  <div className="v">{exif.aperture ?? "—"}</div>
                </div>
                <div>
                  <div className="k">Focal length</div>
                  <div className="v">{exif.focal_length ?? "—"}</div>
                </div>
                <div>
                  <div className="k">Size</div>
                  <div className="v">
                    {exif.width}×{exif.height}
                  </div>
                </div>
              </>
            ) : (
              <div className="muted">
                No EXIF metadata found in this file — the simulator will use the selected camera's
                defaults as the "as-shot" baseline.
              </div>
            )}
          </div>
        </div>
      )}

      <div className="home-links-row">
        {holidayWindow ? (
          <button
            type="button"
            className="muskeg-banner holiday"
            onClick={() => {
              openWorkspace();
            }}
            title={`${holidayWindow.holiday.emoji} ${holidayWindow.holiday.name} — open the coach for your shooting challenge`}
            style={{
              backgroundImage: `linear-gradient(90deg, rgba(10,11,14,0.85) 0%, rgba(10,11,14,0.5) 55%, rgba(10,11,14,0.25) 100%), url("${holidayWindow.holiday.banner}")`,
            }}
          >
            <span className="muskeg-banner-text">
              <strong>
                {holidayWindow.holiday.emoji} {holidayWindow.holiday.name} —{" "}
                {holidayWindow.holiday.challenge.title}
              </strong>
              <span className="muskeg-banner-sub">
                Your holiday shooting goal from the coach — tap to see it
              </span>
            </span>
            <span className="muskeg-banner-go" aria-hidden="true">🎯</span>
          </button>
        ) : (
          <a
            className="muskeg-banner"
            href="https://muskegman.com"
            target="_blank"
            rel="noopener noreferrer"
            title="Visit Muskegman.com"
          >
            <span className="muskeg-banner-text">
              <strong>Muskegman.com</strong>
              <span className="muskeg-banner-sub">Photo software &amp; prints — Pro-Photo_Sorter inside</span>
            </span>
            <span className="muskeg-banner-go" aria-hidden="true">↗</span>
          </a>
        )}
        <button
          type="button"
          className="btn gallery-toggle"
          aria-expanded={galleryOpen}
          onClick={() => setGalleryOpen((v) => !v)}
          title="Photos stored on this device — tap to open or close the gallery"
        >
          🖼️ Gallery{galleryItems.length > 0 ? ` (${galleryItems.length})` : ""}
          <span className="gallery-chev">{galleryOpen ? "▴" : "▾"}</span>
        </button>
      </div>

      {galleryOpen && <GalleryPanel onClose={() => setGalleryOpen(false)} autoAnalyze />}

      {contestLive && (
        <button
          type="button"
          className="contest-strip"
          onClick={() => goChallenge(contestLive.h.id)}
          title="Open the challenge gallery"
        >
          <span>
            {contestLive.phase === "submitting" &&
              <>🏆 {contestLive.h.emoji} {contestLive.h.name} Challenge is live — join the challenge →</>}
            {contestLive.phase === "voting" &&
              <>🏆 {contestLive.h.emoji} {contestLive.h.name} Challenge — voting is open! Pick your top 3 →</>}
            {contestLive.phase === "results" &&
              <>🏆 {contestLive.h.emoji} {contestLive.h.name} Challenge — see the winners →</>}
          </span>
        </button>
      )}

      <div className="upload-form">
        <label>
          What are you shooting? <span className="muted">(optional — tailors recipes, drills and diagnostics)</span>
        </label>
        <StyleWheel
          styles={orderedStylesForWheel(styles)}
          styleId={styleId}
          onPick={(id) => setStyle(styleId === id ? "" : id)}
        />
        {styleId && (
          <p className="muted" style={{ margin: 0 }}>
            {styles.find((s) => s.id === styleId)?.description}{" "}
            <button type="button" className="btn small ghost" onClick={() => setStyle("")} style={{ padding: "2px 10px" }}>
              ✕ clear
            </button>
          </p>
        )}
        <ModelSelector />
        <label>
          What do you want to learn or shoot? <span className="muted">(optional)</span>
          <input
            type="text"
            value={intent}
            placeholder={'e.g. "portraits with blurry backgrounds" or "my kid\'s soccer game"'}
            onChange={(e) => {
              const v = e.target.value;
              setIntent(v);
              // hidden gate: an instructor code typed here opens the dashboard
              if (isInstructorCode(v)) unlockInstructor(v);
            }}
          />
        </label>
        <div className="upload-row">
          <button
            className="btn primary"
            disabled={!hasImage}
            onClick={startAnalysis}
          >
            Analyze with Photo Coach →
          </button>
          <span className="muted">
            {cameras.length} cameras · {styles.length} photography styles · heuristic coach works
            offline
          </span>
          <button className="btn primary" onClick={goClasses}>
            🎓 Training classes
          </button>
          <button className="btn" onClick={goProgress}>
            📈 Progress
          </button>
          {instructorUnlocked && (
            <button className="btn" onClick={goInstructor} title="Content editing — shooting styles & classes">
              🛠 Instructor
            </button>
          )}
          <button
            className="btn"
            onClick={() => {
              void loadDemoPhoto().then((ok) => ok && openWorkspace());
            }}
            title="Explore the simulator instantly — no upload needed"
          >
            🎨 Try a demo photo
          </button>
          <button className="btn small ghost" onClick={goSettings} title="Provider & API key setup">
            ⚙ Coach engine setup
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * One-row style "wheel": the headline genres face forward; ▲ / ▼ roll the
 * rows like a wheel (with wrap-around) to reach the rest of the catalog.
 * Rows slide, chips stay flat and tappable.
 */
function AboutMenu() {
  const [open, setOpen] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [fallbackText, setFallbackText] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // close on any click outside the menu
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const shareApp = async () => {
    const result = await appShare();
    setFallbackText(null);
    if (result === "shared") {
      setShareNote("Shared — thanks for spreading the word!");
    } else if (result === "copied") {
      setShareNote("Copied to your clipboard — paste it to a friend!");
    } else {
      // every automatic path failed — hand over the text for a manual copy
      setFallbackText(buildAppShareMessage());
    }
    setTimeout(() => setShareNote(null), 5000);
  };

  return (
    <div className="about-menu" ref={ref}>
      <button
        type="button"
        className="btn small ghost about-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        About <span className="gallery-chev">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="about-panel" role="dialog" aria-label="About this app">
          <strong>AI Photography Instructor</strong>
          <div className="about-version">
            Version {pkg.version} · {RELEASE_DATE}
          </div>
          <p>
            A photography school in your pocket: a Photo Coach that evaluates your photos,
            a live simulator for practicing settings, and a full curriculum of classes —
            from your first shot to running a photography business.
          </p>
          <hr />
          <strong>MuskegMan Photography &amp; Software</strong>
          <p className="muted">
            Built by MuskegMan — photography and software from Alaska, including{" "}
            <strong>Pro-Photo_Sorter</strong> for managing and editing your photo library.
          </p>
          <a
            className="btn primary small about-link"
            href="https://muskegman.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            🌐 Visit MuskegMan.com ↗
          </a>
          <button className="btn small about-link" onClick={() => void appShare()}>
            📤 Share this app with your friends
          </button>
          {shareNote && <div className="about-share-note" role="status">{shareNote}</div>}
          {fallbackText && (
            <div className="about-share-fallback">
              <div className="muted" style={{ fontSize: "0.75rem" }}>
                Automatic sharing isn't available here — copy this manually:
              </div>
              <textarea
                readOnly
                value={fallbackText}
                rows={5}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="App invite message — select and copy"
              />
            </div>
          )}
          <hr />
          <strong>📜 Content terms</strong>
          <p className="muted" style={{ fontSize: "0.8rem" }}>
            This app is family-friendly. Nudity or adult content, sexualization of minors, extreme
            violence, and illegal content are not allowed — anywhere in the app. The AI coach
            reviews every photo before anything else happens: blocked photos are never coached,
            never saved to your gallery, and never uploaded. Challenge entries are checked again
            on the server. When a photo is blocked, nothing about it is stored — it stays on
            your device and goes nowhere.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * One-row style "wheel": the headline genres face forward; ▲ / ▼ roll the
 * rows like a wheel (with wrap-around) to reach the rest of the catalog.
 * Rows slide, chips stay flat and tappable.
 */
function StyleWheel({
  styles,
  styleId,
  onPick,
}: {
  styles: ShootingStyle[];
  styleId: string;
  onPick: (id: string) => void;
}) {
  const rows = chunkRows(styles, WHEEL_ROW_SIZE);
  const [row, setRow] = useState(() => {
    const idx = styles.findIndex((s) => s.id === styleId);
    return idx >= 0 ? Math.floor(idx / WHEEL_ROW_SIZE) : 0;
  });
  const safeRow = Math.min(row, rows.length - 1);
  const go = (dir: 1 | -1) => setRow((r) => (Math.min(r, rows.length - 1) + dir + rows.length) % rows.length);

  return (
    <div className="style-wheel">
      <button
        type="button"
        className="wheel-arrow"
        onClick={() => go(-1)}
        title="Previous row of styles"
        aria-label="Previous row of styles"
      >
        ▲
      </button>
      <div className="style-wheel-viewport">
        <div className="style-wheel-track" style={{ transform: `translateY(calc(-${safeRow} * var(--wheel-row)))` }}>
          {rows.map((group, ri) => (
            <div className="style-wheel-row" key={ri} aria-hidden={ri !== safeRow}>
              {group.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  tabIndex={ri === safeRow ? 0 : -1}
                  className={`style-chip ${styleId === st.id ? "active" : ""}`}
                  onClick={() => onPick(st.id)}
                  title={st.description}
                >
                  <span className="emoji">{st.emoji}</span>
                  {st.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
      <button
        type="button"
        className="wheel-arrow"
        onClick={() => go(1)}
        title="More styles"
        aria-label="More styles"
      >
        ▼
      </button>
    </div>
  );
}
