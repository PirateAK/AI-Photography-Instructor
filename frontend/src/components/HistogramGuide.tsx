import { useEffect, useRef } from "react";
import { useStore } from "../state/store";
import { clampEv, getCamera } from "../lib/camera";
import { describeHistogram, drawHistogram } from "../lib/histogram";

/**
 * Click-to-learn panel for the live histogram. Rendered as an overlay on top
 * of the coach pane — the photo, its live histogram and the toolbar stay
 * visible and interactive, so the "Try it" buttons shift the real histogram
 * while you read. Closing returns to the coach session exactly as it was.
 */
export default function HistogramGuide({ onClose }: { onClose: () => void }) {
  const histData = useStore((s) => s.histData);
  const cameraId = useStore((s) => s.cameraId);
  const settingsByCamera = useStore((s) => s.settingsByCamera);
  const updateSetting = useStore((s) => s.updateSetting);
  const beginner = useStore((s) => s.beginner);

  const cam = getCamera(cameraId)!;
  const settings = settingsByCamera[cameraId] ?? cam.defaults;
  const reading = describeHistogram(histData);
  const ev = Number(settings.exposure_comp) || 0;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvasRef.current) drawHistogram(canvasRef.current, histData);
  }, [histData]);

  // Escape returns to the coach session, matching the ✕ button
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const nudgeEv = (delta: 1 | -1) => updateSetting("exposure_comp", clampEv(cam, ev + delta));

  return (
    <div className="hist-guide" role="dialog" aria-label="Histogram training">
      <div className="hist-guide-head">
        <div>
          <h3>📊 The histogram</h3>
          <div className="muted" style={{ fontSize: "0.8rem" }}>
            Your camera's exposure truth-teller
          </div>
        </div>
        <button className="btn small" onClick={onClose} title="Back to your coach session — nothing was lost">
          ✕ Back to coach
        </button>
      </div>

      <section className="hist-guide-live">
        <h4>Your photo right now</h4>
        <canvas ref={canvasRef} width={300} height={110} />
        <div className="hist-map" aria-hidden="true">
          <div className="hist-map-bar" />
          <div className="hist-map-labels">
            <span>Shadows</span>
            <span>Midtones</span>
            <span>Highlights</span>
          </div>
        </div>
        <ul className="hist-verdicts">
          {reading.verdicts.map((v, i) => (
            <li key={i} className={`verdict ${v.tone}`}>
              {v.text}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h4>How to read it</h4>
        <p className="hist-prose">
          It's a <strong>brightness census</strong>: how many pixels sit at each brightness, from pure black on the
          left wall to pure white on the right. Height = how many pixels live there.
        </p>
        {beginner && (
          <p className="hist-prose plain">
            In plain words: a mountain range of your photo's brightness. A mountain on the left means lots of dark
            stuff; on the right, lots of bright stuff. Touching either wall means detail is gone in that zone.
          </p>
        )}
        <ul className="hist-points">
          <li>There is no single "correct" shape — a night scene should hug the left, snow the right.</li>
          <li>
            The colored edge stripes on the live histogram are clipping warnings: <span className="chip blue">blue</span>{" "}
            = crushed blacks, <span className="chip red">red</span> = blown whites. Your camera calls these "blinkies".
          </li>
          <li>Pile-ups <em>against</em> a wall are the one thing worth fixing; everything else is taste.</li>
        </ul>
      </section>

      <section>
        <h4>What moves it</h4>
        <ul className="hist-points">
          <li>
            Wider aperture, slower shutter or higher ISO — each adds a stop of light and slides the{" "}
            <strong>whole shape right</strong>.
          </li>
          <li>The opposite directions slide it left. Same subject, same scene — only the dials changed.</li>
          <li>Picture styles stretch (contrast) or squeeze (flat) the shape; white balance shifts color, not this graph.</li>
        </ul>
      </section>

      <section className="hist-try">
        <h4>Try it now</h4>
        <p className="hist-prose">
          Tap a button and watch the live histogram (bottom-left of your photo) slide. Exposure compensation is the
          same +/- dial your camera has.
        </p>
        <div className="hist-try-btns">
          <button className="btn small" onClick={() => nudgeEv(-1)} disabled={ev <= -3}>
            ➖ Darken (−1 EV)
          </button>
          <span className="hist-ev">{ev > 0 ? "+" : ""}{ev.toFixed(1)} EV</span>
          <button className="btn small" onClick={() => nudgeEv(1)} disabled={ev >= 3}>
            ➕ Brighten (+1 EV)
          </button>
        </div>
        {ev !== 0 && (
          <button className="btn small ghost hist-reset" onClick={() => updateSetting("exposure_comp", 0)}>
            ↺ Reset compensation
          </button>
        )}
      </section>

      <section className="hist-field">
        <h4>In the field</h4>
        <p className="hist-prose">
          Every modern camera shows this: press <strong>Info / Display</strong> during playback (or live view on
          mirrorless bodies) to cycle to the histogram screen. Same axes as this one — practice here, read it there.
        </p>
      </section>
    </div>
  );
}
