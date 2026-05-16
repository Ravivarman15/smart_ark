import React from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Top-level error boundary that catches React render errors and prevents
 * the whole app from white-screening. Logs the error for diagnostics and
 * renders a recoverable fallback UI with a "Try again" button.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // In dev this shows via the React overlay anyway; in prod we at least get
    // a console trail the user can screenshot.
    console.error("[ErrorBoundary] Render crashed:", error, info.componentStack);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError || !this.state.error) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback(this.state.error, this.reset);
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full rounded-lg border border-destructive/30 bg-card p-6 shadow-lg text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center text-2xl">⚠️</div>
          <h2 className="text-xl font-semibold text-foreground">Something went wrong</h2>
          <p className="text-sm text-muted-foreground">
            The app hit an unexpected error and couldn't render this screen.
            Try again, or reload the page if the issue persists.
          </p>
          <pre className="text-xs text-left bg-muted rounded p-3 overflow-auto max-h-40 text-muted-foreground">
            {this.state.error.message}
          </pre>
          <div className="flex gap-2 justify-center pt-2">
            <button
              onClick={this.reset}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition"
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-md border border-input bg-background text-sm font-medium hover:bg-accent transition"
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
