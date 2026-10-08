import { useEffect, useState } from "react";
import { fetchEngineSettings, saveEngineSettings } from "../lib/api";
import type { EngineSettings } from "../lib/types";
import { useStore } from "../state/store";

const ENGINE_LABELS: Record<string, string> = {
  mock: "Heuristic coach (offline, deterministic)",
  openai: "OpenAI vision (GPT)",
  gemini: "Google Gemini vision",
};

const MODEL_HINTS: Record<string, string> = {
  mock: "n/a for the heuristic engine",
  openai: "gpt-4o-mini",
  gemini: "gemini-2.0-flash",
};

export default function SettingsScreen() {
  const goUpload = useStore((s) => s.goUpload);
  const dataUrl = useStore((s) => s.dataUrl);
  const [current, setCurrent] = useState<EngineSettings | null>(null);
  const [provider, setProvider] = useState("mock");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchEngineSettings()
      .then((s) => {
        setCurrent(s);
        setProvider(s.provider || "mock");
        setModel(s.model || "");
        setBaseUrl(s.base_url || "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const update: Parameters<typeof saveEngineSettings>[0] = { provider };
      if (apiKey.trim()) update.api_key = apiKey.trim();
      if (clearKey) update.clear_key = true;
      update.model = model.trim();
      update.base_url = baseUrl.trim();
      const saved = await saveEngineSettings(update);
      setCurrent(saved);
      setApiKey("");
      setClearKey(false);
      setMessage(`Saved — active engine: ${ENGINE_LABELS[saved.active_engine] ?? saved.active_engine}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="upload-wrap">
      <div className="upload-hero">
        <h1>⚙️ Coach engine setup</h1>
        <p>
          The app works fully offline with the built-in heuristic coach. To upgrade analysis and
          chat to a full AI vision engine, pick a provider, drop in your API key, and save — no
          restart needed. The key is stored locally on this machine and is never sent anywhere
          except to the provider you choose.
        </p>
      </div>

      {current && (
        <div className="card" style={{ padding: 16, marginBottom: 18 }}>
          <div className="muted" style={{ fontSize: "0.85rem" }}>
            Stored: <strong>{ENGINE_LABELS[current.provider] || current.provider || "(not set)"}</strong>
            {" · "}key: <strong>{current.api_key || "none"}</strong>
            {" · "}active engine now: <strong>{current.active_engine}</strong>
          </div>
        </div>
      )}

      <div className="card settings-form" style={{ padding: 20 }}>
        <label>
          Engine
          <select value={provider} onChange={(e) => setProvider(e.target.value)}>
            {current?.engines?.map((e) => (
              <option key={e} value={e}>
                {ENGINE_LABELS[e] ?? e}
              </option>
            ))}
          </select>
        </label>

        {provider !== "mock" && (
          <>
            <label>
              API key
              <input
                type="password"
                value={apiKey}
                placeholder={current?.api_key && current.api_key !== "none" ? `keep ${current.api_key}` : "paste your key"}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
              />
            </label>
            <label className="check-row">
              <input type="checkbox" checked={clearKey} onChange={(e) => setClearKey(e.target.checked)} />
              Remove the stored key
            </label>
            <label>
              Model <span className="muted">(leave blank for default)</span>
              <input
                type="text"
                value={model}
                placeholder={MODEL_HINTS[provider] ?? ""}
                onChange={(e) => setModel(e.target.value)}
              />
            </label>
            <label>
              API base URL <span className="muted">(optional — proxies / compatible endpoints)</span>
              <input
                type="text"
                value={baseUrl}
                placeholder={provider === "gemini" ? "https://generativelanguage.googleapis.com/v1beta" : "https://api.openai.com/v1"}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </label>
          </>
        )}

        {message && <div className="notice" style={{ color: "var(--good)", borderColor: "rgba(48,209,88,0.4)", background: "rgba(48,209,88,0.08)" }}>{message}</div>}
        {error && <div className="coach-error" style={{ padding: 10 }}>{error}</div>}

        <div className="upload-row">
          <button className="btn primary" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save engine settings"}
          </button>
          <button className="btn" onClick={goUpload}>
            ← {dataUrl ? "Back to photo" : "Back to upload"}
          </button>
        </div>
        <p className="muted" style={{ marginBottom: 0 }}>
          Tip: the heuristic coach stays as an automatic fallback whenever an AI engine fails, is
          missing a key, or returns something invalid.
        </p>
      </div>
    </div>
  );
}
