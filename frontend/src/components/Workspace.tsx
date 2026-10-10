import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import { getCamera } from "../lib/camera";
import ImageViewer from "./ImageViewer";
import CameraBody from "./camera_body/CameraBody";
import CameraToolbar from "./CameraToolbar";
import CoachPanel from "./CoachPanel";
import ModelSelector from "./ModelSelector";

export default function Workspace() {
  const goUpload = useStore((s) => s.goUpload);
  const goSettings = useStore((s) => s.goSettings);
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
        <button className="btn small" onClick={goSettings} title="Coach engine setup — provider & API key">
          ⚙ Setup
        </button>
        <button className="btn small" onClick={goClasses} title="Training classes">
          🎓 Classes
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
          {tab === "preview" ? <ImageViewer /> : <CameraBody cam={getCamera(cameraId)!} />}
        </div>
        <aside className="coach-pane">
          <CoachPanel />
        </aside>
      </div>

      <CameraToolbar />
    </div>
  );
}
