import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { getGalleryBlob, type GalleryMeta } from "../lib/gallery";
import { buildGalleryShareMessage, sharePhotoBlob } from "../lib/share";

const GALLERY_PAGE = 10;

/**
 * The on-device gallery, reusable in two places: collapsed behind the home
 * screen's Gallery button and as a swap-source overlay in the workspace.
 * Vertical wheel of photo cards — tap loads into the coach (and closes via
 * onClose), horizontal swipe trims with undo.
 */
export default function GalleryPanel({
  onClose,
  showClose = true,
  autoAnalyze = false,
}: {
  onClose?: () => void;
  showClose?: boolean;
  /** Run the coach immediately after a photo is chosen (workspace swap flow). */
  autoAnalyze?: boolean;
}) {
  const galleryItems = useStore((s) => s.galleryItems);
  const addToGallery = useStore((s) => s.addToGallery);
  const removeFromGallery = useStore((s) => s.removeFromGallery);
  const undoGalleryRemove = useStore((s) => s.undoGalleryRemove);
  const loadFromGallery = useStore((s) => s.loadFromGallery);
  const startAnalysis = useStore((s) => s.startAnalysis);

  const [busy, setBusy] = useState<string | null>(null);
  const [undoToast, setUndoToast] = useState<{ name: string } | null>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const loadFile = useStore((s) => s.loadFile);
  const openWorkspace = useStore((s) => s.openWorkspace);

  useEffect(() => {
    if (!undoToast) return;
    const t = setTimeout(() => setUndoToast(null), 6000);
    return () => clearTimeout(t);
  }, [undoToast]);

  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-picking the same photo
    if (!files.length) return;
    setBusy(`Reading ${files.length} photo${files.length === 1 ? "" : "s"}…`);
    try {
      const { added, skipped, failures } = await addToGallery(files);
      if (skipped > 0) {
        const heic = failures.filter((f) => f.heic).length;
        const names = failures
          .slice(0, 2)
          .map((f) => f.name)
          .join(", ");
        const lines = [
          `Added ${added} photo${added === 1 ? "" : "s"}; ${skipped} couldn't be read.`,
          heic > 0
            ? `${heic} of those are HEIC (iPhone-style) — browsers can't open that format; convert to JPG and pick again.`
            : `Reason: ${failures[0]?.reason ?? "unknown"}.`,
          names ? `e.g. ${names}${failures.length > 2 ? "…" : ""}` : "",
        ].filter(Boolean);
        alert(lines.join("\n"));
      }
    } catch (err) {
      alert(`Couldn't add to the gallery: ${err instanceof Error ? err.message : err}`);
    } finally {
      setBusy(null);
    }
  };

  const onCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy("Saving shot…");
    try {
      await addToGallery([file]);
    } catch {
      /* gallery write failed — the fallback below still coaches the shot */
    } finally {
      setBusy(null);
    }
    // the shot went into the gallery (newest = first) — open it in the coach;
    // if the gallery write failed, coach it directly from the blob we have
    const newestId = useStore.getState().galleryItems[0]?.id;
    if (newestId !== undefined) {
      onClose?.();
      await loadFromGallery(newestId);
    } else {
      await loadFile(file);
      openWorkspace();
    }
  };

  const handleGalleryRemove = async (id: number, name: string) => {
    await removeFromGallery(id);
    setUndoToast({ name });
  };

  return (
    <div className="gallery-panel">
      <div className="gallery-bar">
        <button className="btn small" disabled={busy !== null} onClick={() => pickRef.current?.click()}>
          {busy ?? "🖼️ Pick photos"}
        </button>
        <button className="btn small" disabled={busy !== null} onClick={() => camRef.current?.click()} title="Shoot straight into the coach">
          📸 Camera
        </button>
        <span className="muted">Lives on this device — nothing uploads until you analyze</span>
        <div className="spacer" />
        {showClose && onClose && (
          <button className="btn small ghost" onClick={onClose}>
            ✕ Close
          </button>
        )}
      </div>
      <input ref={pickRef} type="file" accept="image/*" multiple hidden onChange={(e) => void onPickFiles(e)} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onCapture(e)} />

      <GalleryWheel
        items={galleryItems}
        onLoad={(id) => {
          onClose?.();
          void (async () => {
            await loadFromGallery(id);
            // workspace swap flow: the coach responds to the new photo right away
            if (autoAnalyze) startAnalysis();
          })();
        }}
        onRemove={(id, name) => void handleGalleryRemove(id, name)}
      />

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
 * Single vertical wheel of photo cards. Drag-scrolls up and down (native touch
 * scrolling); a horizontal swipe flings a card away and trims it. Only a page
 * of cards renders at a time — scrolling toward the end feeds more in.
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
        {items.length} photo{items.length === 1 ? "" : "s"}{" "}
        <span className="muted">· tap to coach, swipe a card away to trim</span>
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
  const [shareNote, setShareNote] = useState<string | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);

  const share = async () => {
    setShareNote("Sharing…");
    const blob = await getGalleryBlob(item.id);
    if (!blob) {
      setShareNote("Could not read that photo.");
      return;
    }
    const result = await sharePhotoBlob(blob, buildGalleryShareMessage(), item.name || "photo.jpg");
    setShareNote(
      result === "shared"
        ? "Shared!"
        : result === "copied"
          ? "Link copied — share it anywhere."
          : "Sharing not available on this device.",
    );
    setTimeout(() => setShareNote(null), 3500);
  };

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
      {item.thumb && <img src={item.thumb} alt="" aria-hidden="true" className="gallery-card-bg" draggable={false} />}
      {item.thumb ? (
        <img src={item.thumb} alt={item.name} draggable={false} className="gallery-card-img" />
      ) : (
        <div className="gallery-thumb-fallback">🖼️</div>
      )}
      <span className="gallery-card-name">{item.name}</span>
      <button
        type="button"
        className="gallery-share-btn"
        onClick={(e) => {
          e.stopPropagation();
          void share();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        title="Share this photo"
      >
        📤
      </button>
      {shareNote && <span className="gallery-share-note">{shareNote}</span>}
    </div>
  );
}
