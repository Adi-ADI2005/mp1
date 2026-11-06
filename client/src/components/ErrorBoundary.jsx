import { Component } from "react";

export default class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("FishCheck rendered an unexpected error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="app-error-screen" role="alert">
          <div className="app-error-card">
            <span className="brand-mark" aria-hidden="true">F</span>
            <h1>Something went wrong.</h1>
            <p>The application hit an unexpected error. Reload it to try again.</p>
            <button className="btn-primary" onClick={() => window.location.reload()}>
              Reload the application
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
