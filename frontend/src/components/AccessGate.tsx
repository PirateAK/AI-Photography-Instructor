import { useState } from "react";

/**
 * Site-wide access gate for the published deployment: the whole app stays
 * behind a code until it's entered once per device (stored locally). The
 * server verifies the code and replays it as a cookie on every API call.
 */
export default function AccessGate({ onUnlock }: { onUnlock: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unlock = async () => {
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/access/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (res.ok) {
        localStorage.setItem("site-access-ok", "1");
        onUnlock();
      } else {
        setError("That code isn't right — check it and try again.");
      }
    } catch {
      setError("Couldn't reach the app — check your connection and reload.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="access-gate">
      <div className="access-gate-card">
        <div className="access-gate-emoji">🔒</div>
        <h1>Private access</h1>
        <p>
          This photography instructor is in limited testing. Enter your access code to
          continue — you'll only need it once on this device.
        </p>
        <input
          type="text"
          value={code}
          autoFocus
          placeholder="access code"
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void unlock()}
        />
        <button className="btn primary" disabled={busy || !code.trim()} onClick={() => void unlock()}>
          {busy ? "Checking…" : "Unlock"}
        </button>
        {error && <div className="access-gate-error">{error}</div>}
      </div>
    </div>
  );
}
