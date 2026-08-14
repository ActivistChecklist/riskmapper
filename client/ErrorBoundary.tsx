"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Replaces Next's `app/error.tsx`. Same UI and same "Try again" affordance,
 * but as a real React error boundary since there is no framework route
 * segment to hand the error to.
 */

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface it in DevTools; there is no server to report to.
    console.error("[boundary]", error, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-rm-canvas px-6 text-rm-ink">
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="max-w-md text-center text-sm opacity-70">
          {error.message}
        </p>
        <button
          type="button"
          onClick={this.reset}
          className="rounded-md bg-rm-actions px-4 py-2 text-sm text-rm-actions-fg"
        >
          Try again
        </button>
      </div>
    );
  }
}
