// Catches render-time crashes so a single component error never blanks the app.
import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error("Photo Coach caught a render error:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="upload-wrap">
          <div className="coach-error card" style={{ padding: 20 }}>
            <h4>Something broke while rendering</h4>
            <p className="muted" style={{ lineHeight: 1.55 }}>
              {this.state.error.message}
            </p>
            <p className="muted">
              Your work isn't lost — your camera, settings and unlocks live in this browser.
              Reload to get back to it.
            </p>
            <button className="btn primary" onClick={() => window.location.reload()}>
              ↻ Reload the app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
