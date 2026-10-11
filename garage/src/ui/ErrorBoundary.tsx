import { Component, type ReactNode } from 'react';

type State = { failed: boolean };

/** Catches a failed load (model, transcoder, WebGL context) and explains it instead of leaving an empty stage. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="fallback" role="alert">
        <p>Couldn’t load the garage. Check your connection and try again.</p>
        <p>
          <button type="button" className="hud-button" onClick={() => location.reload()}>Try again</button>
        </p>
        <p><a href="../">Back to indivar.xyz</a></p>
      </div>
    );
  }
}
