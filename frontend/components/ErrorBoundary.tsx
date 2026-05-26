"use client";

import React from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  handleReload = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="h-screen flex flex-col items-center justify-center bg-[#050505] text-white font-sans px-4">
          {/* Ambient background orb */}
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[300px] h-[300px] rounded-full bg-neon/4 blur-[120px] pointer-events-none" />

          <div className="relative z-10 flex flex-col items-center text-center max-w-md">
            {/* Terminal-style header bar */}
            <div className="w-full max-w-xs mb-6 px-4 py-2 bg-white/[0.03] border border-white/[0.06] rounded-xl flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-400/60" />
              <span className="w-2 h-2 rounded-full bg-amber-400/30" />
              <span className="w-2 h-2 rounded-full bg-neon/40" />
              <span className="ml-2 text-[8px] font-mono text-white/15 uppercase tracking-[0.1em] font-light">Runtime Error</span>
            </div>

            {/* Error icon */}
            <div className="w-12 h-12 rounded-2xl bg-rose-400/5 border border-rose-400/15 flex items-center justify-center mb-5">
              <svg className="w-5 h-5 text-rose-400/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>

            {/* Heading */}
            <h1 className="text-lg font-thin text-white/80 tracking-tight mb-2 font-mono">
              Something went wrong
            </h1>

            {/* Error message */}
            <p className="text-[10px] font-mono text-white/25 leading-relaxed mb-8 max-w-sm font-light break-all">
              {this.state.error?.message || "An unexpected error occurred"}
            </p>

            {/* Error stack (collapsed by default) */}
            {this.state.error?.stack && (
              <details className="w-full max-w-sm mb-8">
                <summary className="text-[8px] font-mono text-white/10 cursor-pointer hover:text-white/20 transition-colors uppercase tracking-[0.1em] font-light">
                  Stack trace
                </summary>
                <pre className="mt-2 p-3 bg-white/[0.02] border border-white/[0.04] rounded-xl text-[7px] font-mono text-white/12 leading-relaxed overflow-x-auto text-left font-light whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {this.state.error.stack}
                </pre>
              </details>
            )}

            {/* Reload button */}
            <button
              onClick={this.handleReload}
              className="px-6 py-2.5 rounded-xl bg-neon/5 border border-neon/15 hover:bg-neon/10 hover:border-neon/25 transition-all duration-300 text-xs font-mono text-neon/60 hover:text-neon/80 font-light"
            >
              Reload
            </button>

            <p className="mt-4 text-[7px] font-mono text-white/6 font-light">
              Press Reload to reset the error state
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
