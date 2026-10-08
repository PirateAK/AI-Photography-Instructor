import { useStore } from "../state/store";
import { getCameras, getCamera } from "../lib/camera";

export default function ModelSelector({ compact = false }: { compact?: boolean }) {
  const cameraId = useStore((s) => s.cameraId);
  const setCamera = useStore((s) => s.setCamera);
  const cameras = getCameras();
  const selected = getCamera(cameraId);
  const brands = Array.from(new Set(cameras.map((c) => c.brand)));
  const models = cameras.filter((c) => c.brand === selected?.brand);

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <select
        aria-label="Camera brand"
        value={selected?.brand ?? brands[0]}
        onChange={(e) => {
          const first = cameras.find((c) => c.brand === e.target.value);
          if (first) setCamera(first.id);
        }}
        style={{
          background: "var(--bg-elev2)",
          border: "1px solid var(--border)",
          color: "var(--text)",
          borderRadius: 9,
          padding: compact ? "6px 10px" : "10px 12px",
          fontSize: "0.92rem",
        }}
      >
        {brands.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>
      <select
        aria-label="Camera model"
        value={cameraId}
        onChange={(e) => setCamera(e.target.value)}
        style={{
          background: "var(--bg-elev2)",
          border: "1px solid var(--border)",
          color: "var(--text)",
          borderRadius: 9,
          padding: compact ? "6px 10px" : "10px 12px",
          fontSize: "0.92rem",
          flex: 1,
          minWidth: 180,
        }}
      >
        {models.map((c) => (
          <option key={c.id} value={c.id}>
            {c.model}
          </option>
        ))}
      </select>
      {!compact && selected && <span className="muted">{selected.description}</span>}
    </div>
  );
}
