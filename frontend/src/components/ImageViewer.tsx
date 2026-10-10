import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../state/store";
import { baselineFromExif, defaultSettings, getCamera, parseAperture } from "../lib/camera";
import { focalZoomRatio, getLensById, parseFocal } from "../lib/lenses";
import { drawHistogram } from "../lib/histogram";
import {
  computeHistogram,
  identityParams,
  loadSourceCanvas,
  renderPreview,
  settingsToSimParams,
} from "../lib/simulation";

export default function ImageViewer({ onToggleHistGuide }: { onToggleHistGuide?: () => void }) {
  const dataUrl = useStore((s) => s.dataUrl);
  const cameraId = useStore((s) => s.cameraId);
  const exif = useStore((s) => s.exif);
  const settingsByCamera = useStore((s) => s.settingsByCamera);
  const resetSettings = useStore((s) => s.resetSettings);
  const focusPoint = useStore((s) => s.focusPoint);
  const setFocusPoint = useStore((s) => s.setFocusPoint);
  const highlightSetting = useStore((s) => s.highlightSetting);
  const setHighlight = useStore((s) => s.setHighlight);
  const setHistData = useStore((s) => s.setHistData);

  const [showOriginal, setShowOriginal] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [showHistogram, setShowHistogram] = useState(true);

  const visibleRef = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef<HTMLCanvasElement | null>(null);
  const histRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const cam = getCamera(cameraId)!;
  const settings = settingsByCamera[cameraId] ?? defaultSettings(cam);
  const baseline = useMemo(() => baselineFromExif(cam, exif), [cam, exif]);
  const lens = getLensById(useStore((s) => s.lensByCamera[cameraId]));

  // decode uploaded image to a preview-sized source canvas (once per image)
  useEffect(() => {
    let cancelled = false;
    loadSourceCanvas(dataUrl).then((canvas) => {
      if (!cancelled) sourceRef.current = canvas;
    });
    return () => {
      cancelled = true;
    };
  }, [dataUrl]);

  // debounced re-render on settings/focus change + histogram update
  useEffect(() => {
    const timer = setTimeout(() => {
      const source = sourceRef.current;
      const target = visibleRef.current;
      if (!source || !target) return;
      setRendering(true);
      requestAnimationFrame(() => {
        const params = showOriginal
          ? identityParams()
          : settingsToSimParams(cam, settings, baseline, {
              zoomRatio: lens ? focalZoomRatio(lens, exif) : 1,
              isStops: lens?.image_stabilization ? 4 : 0,
            });
        renderPreview(source, params, target, focusPoint);
        setRendering(false);
        // always compute so the histogram guide has data even with the overlay hidden
        const hist = computeHistogram(target);
        setHistData(hist);
        if (showHistogram && histRef.current) {
          drawHistogram(histRef.current, hist);
        }
      });
    }, 120);
    return () => clearTimeout(timer);
  }, [settings, showOriginal, cam, baseline, cameraId, focusPoint, showHistogram]);

  const usesNonDefaults = JSON.stringify(settings) !== JSON.stringify(defaultSettings(cam));

  const updateFocusFromEvent = (e: React.PointerEvent) => {
    const rect = viewerRef.current?.getBoundingClientRect();
    if (!rect || !draggingRef.current) return;
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    setFocusPoint({ x, y });
  };

  const dofActive = (parseAperture(settings.aperture) ?? baseline.aperture) < baseline.aperture;
  const lensZoom = lens ? focalZoomRatio(lens, exif) : 1;

  return (
    <>
      <div
        className="viewer"
        ref={viewerRef}
        onPointerMove={updateFocusFromEvent}
        onPointerUp={() => (draggingRef.current = false)}
        onPointerCancel={() => (draggingRef.current = false)}
      >
        <canvas ref={visibleRef} />
        <span className="sim-badge">SIMULATION · APPROXIMATE</span>
        {lens && lensZoom > 1.01 && (
          <span
            className="sim-badge lens-zoom-badge"
            title={`Mounted ${lens.model}: simulating ~${Math.round((parseFocal(exif?.focal_length) ?? 0) * lensZoom)}mm framing versus your ${exif?.focal_length ?? ""} shot`}
          >
            🔍 LENS SWAP · {lensZoom.toFixed(1)}× TIGHTER
          </span>
        )}
        {rendering && <span className="loading">rendering…</span>}

        {showHistogram && (
          <div
            className="histogram clickable"
            role="button"
            tabIndex={0}
            onClick={() => onToggleHistGuide?.()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onToggleHistGuide?.();
            }}
            title="Luminance histogram — tap to open or close the histogram training."
          >
            <canvas ref={histRef} width={220} height={72} />
            <span className="hist-caption">histogram</span>
            <span className="hist-hint">ⓘ learn</span>
          </div>
        )}

        {/* draggable focus point for the DoF simulation */}
        <div
          className={`focus-dot ${dofActive ? "" : "dim"} ${highlightSetting === "__focus__" ? "pulse" : ""}`}
          style={{ left: `${focusPoint.x * 100}%`, top: `${focusPoint.y * 100}%` }}
          title={
            dofActive
              ? "Focus point — drag it: the background blur falls away from here"
              : "Focus point — open the aperture wider than the as-shot value to see the blur that follows this point"
          }
          onPointerDown={(e) => {
            draggingRef.current = true;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }}
        />

        <button
          className={`hist-toggle ${showHistogram ? "on" : ""}`}
          onClick={() => setShowHistogram((v) => !v)}
          title="Toggle the live histogram"
        >
          📊
        </button>
      </div>

      <div className="viewer-bar">
        <div className="ab-toggle" role="group" aria-label="Before / after">
          <button className={!showOriginal ? "active" : ""} onClick={() => setShowOriginal(false)}>
            Simulated
          </button>
          <button className={showOriginal ? "active" : ""} onClick={() => setShowOriginal(true)}>
            Original
          </button>
        </div>
        <button className="btn small" onClick={resetSettings} disabled={!usesNonDefaults}>
          ↺ Reset settings
        </button>
        <button
          className={`btn small ${highlightSetting ? "primary" : ""}`}
          onClick={() => setHighlight(highlightSetting ? null : "__focus__")}
          title="Show / hide the draggable focus point used by the depth-of-field simulation"
        >
          ⊹ Focus point
        </button>
        <div className="spacer" />
        <span className="muted">
          Baseline (as shot): ISO {baseline.iso} · {exif?.shutter_speed ?? "1/125"} ·{" "}
          {exif?.aperture ?? "f/4"}
          {exif?.focal_length ? ` · ${exif.focal_length}` : ""} — {exif?.has_exif ? "from EXIF" : "camera defaults"}
          {lens ? ` · 🔍 ${lens.model} mounted` : ""}
        </span>
      </div>
    </>
  );
}
