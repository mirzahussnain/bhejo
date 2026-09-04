"use client";

import { Component, type ReactNode } from "react";

export interface ErrorBoundaryProps {
  readonly children: ReactNode;
  readonly fallbackTitle?: string;
  readonly fallbackMessage?: string;
  readonly onReset?: () => void;
  readonly fallback?: ReactNode;
}

interface ErrorBoundaryState {
  readonly hasError: boolean;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(): void {
    // Gracefully catch rendering exceptions without leaking sensitive frames or data
  }

  handleReset = (): void => {
    this.props.onReset?.();
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const title =
        this.props.fallbackTitle ?? "Something went wrong";
      const message =
        this.props.fallbackMessage ??
        "An unexpected problem occurred. Please try again.";

      return (
        <div
          role="alert"
          aria-live="assertive"
          className="flex min-h-[280px] w-full flex-col items-center justify-center rounded-2xl bg-slate-900/90 p-6 text-center text-white"
        >
          <div className="flex size-12 items-center justify-center rounded-full bg-rose-500/20 text-rose-300">
            <svg
              className="size-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="mt-4 text-lg font-semibold tracking-[-0.01em]">
            {title}
          </h2>
          <p className="mt-2 max-w-sm text-sm text-slate-300">{message}</p>
          <button
            type="button"
            onClick={this.handleReset}
            className="mt-6 min-h-11 rounded-xl bg-white px-5 text-sm font-semibold text-slate-950 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
