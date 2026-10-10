import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { getCameras } from "../lib/camera";
import { isInstructorCode } from "../lib/training";
import { chunkRows, orderedStylesForWheel } from "../lib/styles";
import type { ShootingStyle } from "../lib/styles";
import type { GalleryMeta } from "../lib/gallery";
import ModelSelector from "./ModelSelector";

const WHEEL_ROW_SIZE = 5;
const GALLERY_PAGE = 10;

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
  const addToGallery = useStore((s) => s.addToGallery);
  const removeFromGallery = useStore((s) => s.removeFromGallery);
  const undoGalleryRemove = useStore((s) => s.undoGalleryRemove);
  const loadFromGallery = useStore((s) => s.loadFromGallery);
  const startAnalysis = useStore((s) => s.startAnalysis);
  const cameras = getCameras();
  const styles = useStore((s) => s.styles);

  const [dragging, setDragging] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [undoToast, setUndoToast] = useState<{ name: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  // auto-dismiss the remove toast
  useEffect(() => {
    if (!undoToast) return;
    const t = setTimeout(() => setUndoToast(null), 6000);
    return () => clearTimeout(t);
  }, [undoToast]);

  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files?.length) await addToGallery(Array.from(files));
    e.target.value = ""; // allow re-picking the same photo
  };

  const onCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await addToGallery([file]);
    await loadFile(file);
    openWorkspace();
  };

  const handleGalleryRemove = async (id: number, name: string) => {
    await removeFromGallery(id);
    setUndoToast({ name });
  };

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
        <h1>📷 AI Photography Instructor</h1>
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

      {galleryOpen && (
        <div className="gallery-panel">
          <div className="gallery-bar">
            <button className="btn small" onClick={() => pickRef.current?.click()}>
              🖼️ Pick photos
            </button>
            <button className="btn small" onClick={() => camRef.current?.click()} title="Shoot straight into the coach">
              📸 Camera
            </button>
            <span className="muted">Lives on this device — nothing uploads until you analyze</span>
            <div className="spacer" />
            <button className="btn small ghost" onClick={() => setGalleryOpen(false)}>
              ✕ Close
            </button>
          </div>
          <input ref={pickRef} type="file" accept="image/*" multiple hidden onChange={(e) => void onPickFiles(e)} />
          <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onCapture(e)} />

          <GalleryWheel
            items={galleryItems}
            onLoad={(id) => {
              setGalleryOpen(false); // selecting a photo closes the wheel
              void loadFromGallery(id);
            }}
            onRemove={(id, name) => void handleGalleryRemove(id, name)}
          />
        </div>
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

      {undoToast && (
        <div className="gallery-toast" role="status">
          <span>Removed {undoToast.name}</span>
          <button
            className="btn small"
            onClick={() => {
              setUndoToast(null);
              void undoGalleryRemove();
            }}
          >
            ↺ Undo
          </button>
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

/**
 * The phone gallery: a single vertical wheel of photo cards. Drag-scrolls up
 * and down (native touch scrolling); a horizontal swipe flings a card away and
 * trims it from the gallery (undo toast appears). Only a page of cards renders
 * at a time — scrolling toward the end feeds more into the wheel.
 */
function GalleryWheel({
  items,
  onLoad,
  onRemove,
}: {
  items: GalleryMeta[];
  onLoad: (id: number) => void;
  onRemove: (id: number, name: string) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(GALLERY_PAGE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // grow the rendered window as the sentinel scrolls into view
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || visibleCount >= items.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((en) => en.isIntersecting)) {
          setVisibleCount((c) => Math.min(c + GALLERY_PAGE, items.length));
        }
      },
      { root: el.closest(".gallery-list"), rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visibleCount, items.length]);

  if (items.length === 0) {
    return (
      <p className="muted gallery-empty">
        Your gallery is empty — pick a few photos (or shoot one with the camera) and they'll be
        waiting here, on this device, every time you come back.
      </p>
    );
  }

  const visible = items.slice(0, visibleCount);

  return (
    <div className="gallery-wrap">
      <div className="gallery-title">
        Your gallery <span className="muted">· {items.length} photo{items.length === 1 ? "" : "s"} — tap to coach, swipe a card away to trim</span>
      </div>
      <div className="gallery-list">
        {visible.map((item) => (
          <GalleryCard key={item.id} item={item} onLoad={onLoad} onRemove={onRemove} />
        ))}
        {visibleCount < items.length && <div ref={sentinelRef} className="gallery-sentinel" />}
      </div>
    </div>
  );
}

function GalleryCard({
  item,
  onLoad,
  onRemove,
}: {
  item: GalleryMeta;
  onLoad: (id: number) => void;
  onRemove: (id: number, name: string) => void;
}) {
  const [dx, setDx] = useState(0);
  const [gone, setGone] = useState(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    startRef.current = { x: e.clientX, y: e.clientY };
    movedRef.current = false;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!startRef.current) return;
    const ddx = e.clientX - startRef.current.x;
    const ddy = e.clientY - startRef.current.y;
    if (Math.abs(ddx) > 10 && Math.abs(ddx) > Math.abs(ddy)) {
      movedRef.current = true;
      setDx(ddx);
    }
  };
  const settle = () => {
    startRef.current = null;
    if (Math.abs(dx) > 72) {
      setGone(true);
      setTimeout(() => onRemove(item.id, item.name), 150);
    } else {
      setDx(0);
    }
  };

  return (
    <div
      className="gallery-card"
      style={{
        transform: `translateX(${gone ? dx * 4 : dx}px) rotate(${dx / 40}deg)`,
        opacity: gone ? 0 : 1,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={settle}
      onPointerCancel={() => {
        startRef.current = null;
        setDx(0);
      }}
      onClick={() => {
        if (!movedRef.current) onLoad(item.id);
      }}
      title="Tap to load into the coach — swipe sideways to trim"
    >
      <img src={item.thumb} alt={item.name} draggable={false} />
      <span className="gallery-card-name">{item.name}</span>
    </div>
  );
}
