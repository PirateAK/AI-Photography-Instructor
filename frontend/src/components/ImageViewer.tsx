import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../state/store";
import { baselineFromExif, defaultSettings, getCamera } from "../lib/camera";
import {
  computeHistogram,
  identityParams,
  loadSourceCanvas,
  renderPreview,
  settingsToSimParams,
} from "../lib/simulation";

export default function ImageViewer() {
  const dataUrl = useStore((s) => s.dataUrl);
  const cameraId = useStore((s) => s.cameraId);
  const exif = useStore((s) => s.exif);
  const settingsByCamera = useStore((s) => s.settingsByCamera);
  const resetSettings = useStore((s) => s.resetSettings);
  const focusPoint = useStore((s) => s.focusPoint);
  const setFocusPoint = useStore((s) => s.setFocusPoint);
  const highlightSetting = useStore((s) => s.highlightSetting);
  const setHighlight = useStore((s) => s.setHighlight);

  const [showOriginal, setShowOriginal] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [showHistogram, setShowHistogram] = useState(true);

  const visibleRef = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef<HTMLCanvasElement | null>(null);
  const histRef = useRef<HTMLCanvasElement>(null);
  const draggingRef = useRef(false);

  const cam = getCamera(cameraId)!;
  const settings = settingsByCamera[cameraId] ?? defaultSettings(cam);
  const baseline = useMemo(() => baselineFromExif(cam, exif), [cam, exif]);

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
          : settingsToSimParams(cam, settings, baseline);
        renderPreview(source, params, target, focusPoint);
        setRendering(false);
        if (showHistogram && histRef.current) {
          const hist = computeHistogram(target);
          drawHistogram(histRef.current, hist);
        }
      });
    }, 120);
    return () => clearTimeout(timer);
  }, [settings, showOriginal, cam, baseline, cameraId, focusPoint, showHistogram]);

  const usesNonDefaults = JSON.stringify(settings) !== JSON.stringify(defaultSettings(cam));

  const onPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    setFocusPoint({ x, y });
  };

  return (
    <>
      <div className="viewer">
        <canvas ref={visibleRef} />
        <span className="sim-badge">SIMULATION · APPROXIMATE</span>
        {rendering && <span className="loading">rendering…</span>}

        {showHistogram && (
          <div className="histogram" title="Luminance histogram — watch it shift as you change settings">
            <canvas ref={histRef} width={220} height={72} />
            <span className="hist-caption">histogram</span>
          </div>
        )}

        {/* draggable focus point for the DoF simulation */}
        <div
          className={`focus-dot ${highlightSetting === "__focus__" ? "pulse" : ""}`}
          style={{ left: `${focusPoint.x * 100}%`, top: `${focusPoint.y * 100}%` }}
          title="Focus point — drag it; the depth-of-field blur falls away from here"
          onPointerDown={(e) => {
            draggingRef.current = true;
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={onPointer}
          onPointerUp={() => {
            draggingRef.current = false;
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
          {exif?.aperture ?? "f/4"} — {exif?.has_exif ? "from EXIF" : "camera defaults"}
        </span>
      </div>
    </>
  );
}

function drawHistogram(
  canvas: HTMLCanvasElement,
  hist: { bins: number[]; clipLow: number; clipHigh: number } | null,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "rgba(10, 11, 14, 0.72)";
  ctx.fillRect(0, 0, w, h);
  if (!hist) return;
  const bw = w / hist.bins.length;
  for (let i = 0; i < hist.bins.length; i++) {
    const bh = hist.bins[i] * (h - 10);
    // blue → white → red across the tonal range
    const t = i / (hist.bins.length - 1);
    ctx.fillStyle =
      t < 0.06 ? "#4a9eff" : t > 0.94 ? "#ff5a4e" : `rgba(235, 238, 245, ${0.35 + 0.5 * Math.min(1, hist.bins[i] * 3)})`;
    ctx.fillRect(i * bw, h - bh, Math.max(1, bw - 1), bh);
  }
  if (hist.clipHigh > 0.01) {
    ctx.fillStyle = "#ff453a";
    ctx.fillRect(w - 3, 0, 3, h);
  }
  if (hist.clipLow > 0.05) {
    ctx.fillStyle = "#4a9eff";
    ctx.fillRect(0, 0, 3, h);
  }
}
