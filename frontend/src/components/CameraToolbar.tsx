// Dynamic camera toolbar — rendered entirely from the selected camera's JSON.
// Settings the camera doesn't support simply never render; capabilities differ
// per model (ISO range, EV range, Kelvin WB, option names…).
import { useStore } from "../state/store";
import {
  defaultSettings,
  getCamera,
  isDiscrete,
  isHighIso,
  isRange,
  stepOption,
} from "../lib/camera";
import type { CameraModel, DiscreteSetting, RangeSetting, Settings } from "../lib/types";

export default function CameraToolbar() {
  const cameraId = useStore((s) => s.cameraId);
  const highlight = useStore((s) => s.highlightSetting);
  const cam = getCamera(cameraId)!;
  const settings = useStore((s) => s.settingsByCamera[cameraId]) ?? defaultSettings(cam);

  return (
    <div className="toolbar" aria-label={`${cam.brand} ${cam.model} controls`}>
      <div className="toolbar-groups">
        {cam.layout.groups.map((group) => (
          <div className="toolbar-group" key={group.id}>
            <div className="toolbar-group-label">{group.label}</div>
            <div className="controls">
              {group.settings.map((settingId) => {
                const def = cam.settings[settingId];
                if (!def) return null; // camera lacks this setting -> hide
                const highlighted = highlight === settingId;
                if (isRange(def)) {
                  return (
                    <RangeControl
                      key={settingId}
                      cam={cam}
                      id={settingId}
                      def={def}
                      value={Number(settings[settingId] ?? def.default)}
                      highlighted={highlighted}
                    />
                  );
                }
                return (
                  <DiscreteControl
                    key={settingId}
                    cam={cam}
                    id={settingId}
                    def={def}
                    settings={settings}
                    highlighted={highlighted}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DiscreteControl({
  cam,
  id,
  def,
  settings,
  highlighted,
}: {
  cam: CameraModel;
  id: string;
  def: DiscreteSetting;
  settings: Settings;
  highlighted: boolean;
}) {
  const updateSetting = useStore((s) => s.updateSetting);
  const beginner = useStore((s) => s.beginner);
  const value = String(settings[id] ?? def.default);
  const useStepper = id === "iso" || id === "shutter_speed" || id === "aperture";

  return (
    <div className={`control ${highlighted ? "highlighted" : ""}`}>
      <div className="control-label">
        {def.label}
        <span className={`value ${id === "iso" && isHighIso(cam, value) ? "warn-value" : ""}`}>
          {labelFor(def, value)}
        </span>
        {id === "iso" && isHighIso(cam, value) && <span title={def.usable_note}>⚠️</span>}
      </div>

      {useStepper ? (
        <div className="stepper">
          <button
            aria-label={`decrease ${def.label}`}
            onClick={() => {
              const next = stepOption(cam, id, value, -1);
              if (next) updateSetting(id, next);
            }}
          >
            ‹
          </button>
          <span className="stepper-value">{labelFor(def, value)}</span>
          <button
            aria-label={`increase ${def.label}`}
            onClick={() => {
              const next = stepOption(cam, id, value, 1);
              if (next) updateSetting(id, next);
            }}
          >
            ›
          </button>
        </div>
      ) : (
        <div className="segmented" role="radiogroup" aria-label={def.label}>
          {def.options.map((opt) => (
            <button
              key={opt.value}
              className={opt.value === value ? "active" : ""}
              onClick={() => updateSetting(id, opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {id === "white_balance" && value === "kelvin" && def.kelvin && (
        <KelvinSlider
          min={def.kelvin.min}
          max={def.kelvin.max}
          step={def.kelvin.step}
          value={Number(settings.wb_kelvin ?? def.kelvin.default)}
          onChange={(k) => updateSetting("wb_kelvin", k)}
        />
      )}

      {beginner && def.beginner && <div className="beginner-note">{def.beginner}</div>}
    </div>
  );
}

function RangeControl({
  cam,
  id,
  def,
  value,
  highlighted,
}: {
  cam: CameraModel;
  id: string;
  def: RangeSetting;
  value: number;
  highlighted: boolean;
}) {
  const updateSetting = useStore((s) => s.updateSetting);
  const beginner = useStore((s) => s.beginner);
  const steps = Math.round((def.max - def.min) / def.step);
  const current = Math.round((value - def.min) / def.step);

  const fmt = (v: number) => {
    const thirds = Math.round(v * 3);
    const whole = Math.trunc(thirds / 3);
    const rem = Math.abs(thirds % 3);
    const frac = rem === 1 ? "⅓" : rem === 2 ? "⅔" : "";
    const sign = thirds > 0 ? "+" : "";
    return `${sign}${whole}${frac} ${def.unit ?? ""}`.trim();
  };

  return (
    <div className={`control ${highlighted ? "highlighted" : ""}`}>
      <div className="control-label">
        {def.label}
        <span className="value">{fmt(value)}</span>
      </div>
      <input
        type="range"
        className="slider"
        min={0}
        max={steps}
        step={1}
        value={current}
        aria-label={def.label}
        onChange={(e) => updateSetting(id, Number((def.min + Number(e.target.value) * def.step).toFixed(3)))}
      />
      <div className="muted" style={{ fontSize: "0.7rem" }}>
        {fmt(def.min)} … {fmt(def.max)}
      </div>
      {beginner && def.beginner && <div className="beginner-note">{def.beginner}</div>}
    </div>
  );
}

function KelvinSlider({
  min,
  max,
  step,
  value,
  onChange,
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div className="control-label">
        Kelvin <span className="value">{value}K</span>
      </div>
      <input
        type="range"
        className="slider"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label="Color temperature"
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function labelFor(def: DiscreteSetting, value: string): string {
  return def.options.find((o) => o.value === value)?.label ?? value;
}
