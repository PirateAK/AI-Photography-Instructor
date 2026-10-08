import { useRef, useState } from "react";
import { useStore } from "../state/store";
import { getCameras } from "../lib/camera";
import { getStyles } from "../lib/styles";
import ModelSelector from "./ModelSelector";

export default function UploadScreen() {
  const loadFile = useStore((s) => s.loadFile);
  const dataUrl = useStore((s) => s.dataUrl);
  const exif = useStore((s) => s.exif);
  const intent = useStore((s) => s.intent);
  const setIntent = useStore((s) => s.setIntent);
  const styleId = useStore((s) => s.styleId);
  const setStyle = useStore((s) => s.setStyle);
  const goSettings = useStore((s) => s.goSettings);
  const startAnalysis = useStore((s) => s.startAnalysis);
  const cameras = getCameras();
  const styles = getStyles();

  const [dragging, setDragging] = useState(false);
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

      <div className="upload-form">
        <label>
          What are you shooting? <span className="muted">(optional — tailors recipes, drills and diagnostics)</span>
        </label>
        <div className="style-grid">
          {styles.map((st) => (
            <button
              key={st.id}
              type="button"
              className={`style-chip ${styleId === st.id ? "active" : ""}`}
              onClick={() => setStyle(styleId === st.id ? "" : st.id)}
              title={st.description}
            >
              <span className="emoji">{st.emoji}</span>
              {st.label}
            </button>
          ))}
          {styleId && (
            <button type="button" className="style-chip" onClick={() => setStyle("")}>
              ✕ clear
            </button>
          )}
        </div>
        {styleId && (
          <p className="muted" style={{ margin: 0 }}>
            {getStyles().find((s) => s.id === styleId)?.description}
          </p>
        )}
        <ModelSelector />
        <label>
          What do you want to learn or shoot? <span className="muted">(optional)</span>
          <input
            type="text"
            value={intent}
            placeholder={'e.g. "portraits with blurry backgrounds" or "my kid\'s soccer game"'}
            onChange={(e) => setIntent(e.target.value)}
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
          <button className="btn small ghost" onClick={goSettings} title="Provider & API key setup">
            ⚙ Coach engine setup
          </button>
        </div>
      </div>
    </div>
  );
}
