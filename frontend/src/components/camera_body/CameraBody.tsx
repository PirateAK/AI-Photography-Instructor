// Interactive illustrated camera body — 6 views (top/back/front/left/right/bottom)
// with clickable hotspots that jump to the matching toolbar control. Hotspot
// positions come from camera_models.json ("body" block), the silhouettes are
// drawn here per body type ("dslr" | "mirrorless").
import { useEffect, useState } from "react";
import type { BodyHotspot, CameraModel } from "../../lib/types";
import { useStore } from "../../state/store";

const VIEWS = ["top", "back", "front", "left", "right", "bottom"] as const;
type View = (typeof VIEWS)[number];

const VIEW_LABELS: Record<View, string> = {
  top: "Top",
  back: "Back",
  front: "Front",
  left: "Left side",
  right: "Right side",
  bottom: "Bottom",
};

export default function CameraBody({ cam }: { cam: CameraModel }) {
  const [view, setView] = useState<View>("top");
  const body = cam.body;

  if (!body || Object.keys(body.hotspots ?? {}).length === 0) {
    return (
      <div className="viewer card" style={{ padding: 30, textAlign: "center", color: "var(--text-dim)" }}>
        This camera has no body illustration in camera_models.json yet — add a "body" block to
        enable the interactive views.
      </div>
    );
  }

  return (
    <div className="camera-body-wrap">
      <div className="ab-toggle" role="tablist" aria-label="Camera view">
        {VIEWS.filter((v) => body.hotspots[v]?.length).map((v) => (
          <button key={v} className={view === v ? "active" : ""} onClick={() => setView(v)}>
            {VIEW_LABELS[v]}
          </button>
        ))}
      </div>
      <div className="camera-body-viewer card">
        <BodySvg bodyType={body.type} view={view} />
        {(body.hotspots[view] ?? []).map((h) => (
          <Hotspot key={h.id} hotspot={h} view={view} />
        ))}
      </div>
      <div className="muted" style={{ fontSize: "0.75rem" }}>
        Illustrated body · hover a pin to see the control, click one with a ⚙ to highlight it in
        the toolbar. Pins flash when you change that setting.
      </div>
    </div>
  );
}

function Hotspot({ hotspot: h, view }: { hotspot: BodyHotspot; view: View }) {
  const setHighlight = useStore((s) => s.setHighlight);
  const lastChanged = useStore((s) => s.lastChangedSetting);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (lastChanged && h.setting && lastChanged.id === h.setting) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 1600);
      return () => clearTimeout(t);
    }
  }, [lastChanged, h.setting]);

  return (
    <div
      className={`hotspot ${h.setting ? "clickable" : ""} ${flash ? "flash" : ""}`}
      style={{ left: `${(h.x / 400) * 100}%`, top: `${(h.y / 260) * 100}%` }}
      onClick={() => h.setting && setHighlight(h.setting)}
      role={h.setting ? "button" : undefined}
      title={h.label + (h.info ? ` — ${h.info}` : "") + (h.setting ? " (click to highlight in toolbar)" : "")}
    >
      <span className="pin" />
      <span className="hotspot-label">{h.label}</span>
    </div>
  );
}

// ------------------------------------------------------------- silhouettes

function BodySvg({ bodyType, view }: { bodyType: "dslr" | "mirrorless" | "vlog" | "phone"; view: View }) {
  const isDslr = bodyType === "dslr";
  const isVlog = bodyType === "vlog";
  const isPhone = bodyType === "phone";
  const fill = "#23262d";
  const stroke = "#3c414d";
  return (
    <svg viewBox="0 0 400 260" className="body-svg" role="img">
      {isPhone && view === "front" && (
        <g fill={fill} stroke={stroke} strokeWidth="2">
          <rect x="150" y="24" width="100" height="212" rx="16" />
          <rect x="158" y="34" width="84" height="192" rx="10" fill="#101216" />
          <circle cx="200" cy="46" r="4" fill="#181b21" />
          <text x="200" y="130" textAnchor="middle" fontSize="12" fill="#4a5160">TAP TO FOCUS</text>
        </g>
      )}
      {isPhone && view === "back" && (
        <g fill={fill} stroke={stroke} strokeWidth="2">
          <rect x="150" y="24" width="100" height="212" rx="16" />
          <rect x="162" y="34" width="76" height="92" rx="14" fill="#1b1e24" />
          <circle cx="200" cy="86" r="16" fill="#101216" />
          <circle cx="200" cy="86" r="8" fill="#23262d" />
          <circle cx="232" cy="52" r="5" fill="#181b21" />
        </g>
      )}
      {isPhone && (view === "left" || view === "right") && (
        <g fill={fill} stroke={stroke} strokeWidth="2">
          <rect x="150" y="24" width="100" height="212" rx="16" />
          {view === "right" ? (
            <>
              <rect x="248" y="90" width="5" height="46" rx="2" fill="#3c414d" />
              <rect x="248" y="146" width="5" height="30" rx="2" fill="#3c414d" />
            </>
          ) : (
            <rect x="147" y="120" width="5" height="26" rx="2" fill="#3c414d" />
          )}
        </g>
      )}
      {isPhone && view === "top" && (
        <g fill={fill} stroke={stroke} strokeWidth="2">
          <rect x="110" y="96" width="180" height="68" rx="18" />
          <circle cx="140" cy="130" r="3" fill="#101216" />
        </g>
      )}
      {isPhone && view === "bottom" && (
        <g fill={fill} stroke={stroke} strokeWidth="2">
          <rect x="110" y="96" width="180" height="68" rx="18" />
          <rect x="176" y="118" width="34" height="10" rx="5" fill="#101216" />
          <circle cx="230" cy="123" r="2.5" fill="#101216" />
          <circle cx="238" cy="123" r="2.5" fill="#101216" />
          <circle cx="246" cy="123" r="2.5" fill="#101216" />
        </g>
      )}
      {!isPhone && view === "top" && (
        <g fill={fill} stroke={stroke} strokeWidth="2">
          <rect x="70" y="85" width="260" height="145" rx="18" />
          {isDslr ? (
            <polygon points="160,85 178,42 222,42 240,85" />
          ) : isVlog ? (
            <rect x="140" y="72" width="120" height="16" rx="7" fill="#1b1e24" />
          ) : (
            <rect x="165" y="52" width="70" height="36" rx="10" />
          )}
          <rect x={isDslr ? 278 : 288} y="78" width={isDslr ? 52 : 42} height="152" rx="20" fill="#262a31" />
          <circle cx="200" cy={isDslr ? 110 : 100} r="14" fill="#111318" opacity={isDslr ? 1 : 0.5} />
          <rect x="130" y="130" width="140" height="60" rx="8" fill="#101216" opacity={isDslr ? 1 : 0.35} />
          <text x="200" y="165" textAnchor="middle" fontSize="13" fill="#4a5160" opacity={isDslr ? 1 : 0.4}>
            {isDslr ? "TOP LCD" : isVlog ? "FLAT TOP" : "no top LCD"}
          </text>
        </g>
      )}
      {!isPhone && view === "back" && (
        <g fill={fill} stroke={stroke} strokeWidth="2">
          <rect x="70" y="40" width="260" height="190" rx="18" />
          {isDslr ? (
            <rect x="172" y="55" width="56" height="34" rx="8" fill="#101216" />
          ) : isVlog ? (
            <rect x="172" y="55" width="56" height="34" rx="8" fill="#101216" opacity="0.25" />
          ) : (
            <rect x="118" y="55" width="56" height="34" rx="8" fill="#101216" />
          )}
          <rect x={isDslr ? 150 : 160} y="102" width="165" height="112" rx="8" fill="#101216" />
          <text x={isDslr ? 232 : 242} y="160" textAnchor="middle" fontSize="13" fill="#4a5160">
            {isVlog ? "FLIP SCREEN" : "LCD"}
          </text>
          <circle cx={isDslr ? 235 : 242} cy="158" r="30" fill="#181b21" opacity="0.6" />
        </g>
      )}
      {!isPhone && view === "front" && (
        <g fill={fill} stroke={stroke} strokeWidth="2">
          <rect x="85" y="55" width="230" height="160" rx="18" />
          {isDslr ? (
            <polygon points="170,55 186,20 214,20 230,55" />
          ) : isVlog ? (
            <rect x="170" y="34" width="60" height="24" rx="7" fill="#1b1e24" />
          ) : (
            <rect x="172" y="26" width="56" height="32" rx="8" />
          )}
          <rect x={isDslr ? 268 : 272} y="70" width={isDslr ? 47 : 43} height="145" rx="18" fill="#262a31" />
          <circle cx="200" cy="135" r="58" fill="#1b1e24" />
          <circle cx="200" cy="135" r="40" fill="#101216" />
          <circle cx="200" cy="135" r="18" fill="#23262d" />
        </g>
      )}
      {!isPhone && (view === "left" || view === "right") && (
        <g fill={fill} stroke={stroke} strokeWidth="2">
          <rect x="80" y="70" width="240" height="130" rx="18" />
          {/* lens pointing right */}
          <rect x="318" y="110" width="42" height="50" rx="8" fill="#1b1e24" />
          <rect x="356" y="118" width="18" height="34" rx="4" fill="#101216" />
          {view === "right" && <rect x="60" y="78" width="34" height="114" rx="16" fill="#262a31" />}
          <rect x="140" y="95" width="120" height="36" rx="6" fill="#101216" opacity="0.5" />
        </g>
      )}
      {!isPhone && view === "bottom" && (
        <g fill={fill} stroke={stroke} strokeWidth="2">
          <rect x="80" y="80" width="240" height="100" rx="16" />
          <rect x="96" y="100" width="60" height="58" rx="8" fill="#101216" />
          <circle cx="200" cy="130" r="17" fill="#101216" />
          <rect x="250" y="100" width="54" height="58" rx="8" fill="#101216" />
        </g>
      )}
    </svg>
  );
}
