"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Compact fallback for the slim ticker strip. */
  fallback?: ReactNode;
  label?: string;
};

type State = { hasError: boolean };

/**
 * Isolates market UI failures so a bad price/stats payload never blank-screens the app.
 */
export class MarketErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[market:${this.props.label ?? "feature"}]`, error, info.componentStack);
  }

  override render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div
            role="status"
            aria-live="polite"
            className="border-b border-white/8 bg-[#070b10] px-4 py-1.5 text-center text-[11px] text-white/40"
          >
            Market data temporarily unavailable
          </div>
        )
      );
    }
    return this.props.children;
  }
}
