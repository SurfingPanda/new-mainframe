import React from 'react';

// Top-level safety net: a render/runtime error in any page or component would
// otherwise blank the whole app with no recovery. This catches it, logs it, and
// shows a recoverable fallback. Errors during event handlers / async code are
// NOT caught by React error boundaries — only render-phase errors.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep a console trail for debugging; a real logger could ship this remotely.
    console.error('Unhandled UI error:', error, info?.componentStack);
  }

  handleReload = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  handleHome = () => {
    // Hard navigation so we leave the broken render tree entirely.
    window.location.assign('/dashboard');
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-card dark:border-slate-800 dark:bg-slate-900">
          <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01" />
            </svg>
          </span>
          <h1 className="mt-4 text-lg font-semibold text-brand-900 dark:text-white">Something went wrong</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            The page hit an unexpected error. You can reload to try again, or head back to your dashboard.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <button
              type="button"
              onClick={this.handleHome}
              className="btn-ghost !px-3.5 !py-2 text-xs"
            >
              Go to dashboard
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center rounded-md bg-brand-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-brand-800 dark:bg-brand-600 dark:hover:bg-brand-500"
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
