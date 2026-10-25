import React from 'react';

/** DIAGNOSTIC ERROR BOUNDARY (Adam, 2026-10-25): the app has NO
 * error boundary, so any render-phase throw unmounts the whole
 * tree and the page goes black (the 2026-10-25 solo-death black
 * screen). This boundary sits around the entire App tree and
 * renders a VISIBLE error screen instead — the error message,
 * the JS stack, and the React component stack — with COPY and
 * RESTART doors, so a recurrence reports itself instead of
 * going black. The fallback is deliberately trivial (inline
 * styles, no hooks, no app components, no Tailwind) so it
 * cannot throw the way the tree did. It does NOT fix the
 * underlying throw; it names it.
 *
 * TYPING NOTE: this repo ships no React types (react resolves
 * to index.js, untyped), so React.Component is `any` and a
 * class extending it would have no typed props/state/setState.
 * The shim below types exactly the base members the boundary
 * uses; React still provides them at runtime. */
type ErrorBoundaryProps = { children: React.ReactNode };
type ErrorBoundaryState = { error: Error | null; componentStack: string; copied: boolean };

type ComponentBase<P, S> = abstract new (props: P) => {
  props: P;
  state: S;
  setState: (partial: Partial<S> | ((prev: S) => Partial<S>)) => void;
};
const ComponentBase = React.Component as unknown as ComponentBase<ErrorBoundaryProps, ErrorBoundaryState>;

export class ErrorBoundary extends ComponentBase {
  state: ErrorBoundaryState = { error: null, componentStack: '', copied: false };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    this.setState({ componentStack: info.componentStack || '' });
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] render throw caught:', error, info.componentStack);
  }

  private copyDetails = async (details: string) => {
    try {
      await navigator.clipboard.writeText(details);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = details;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    this.setState({ copied: true });
    window.setTimeout(() => this.setState({ copied: false }), 2000);
  };

  render() {
    const { error, componentStack, copied } = this.state;
    if (!error) return this.props.children;
    const details = [
      `Error: ${error.message}`,
      `Stack: ${error.stack || 'no stack available'}`,
      `Component stack:${componentStack || ' (none reported)'}`,
    ].join('\n');
    return (
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 9999, overflowY: 'auto',
          background: '#1a0505', color: '#f5f5f4', fontFamily: 'monospace',
          padding: 16, textAlign: 'left',
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 'bold', color: '#fbbf24', marginBottom: 8 }}>
          SOMETHING BROKE IN THE GAME
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 12 }}>
          This screen replaces the black screen — the game hit an error while drawing.
          Copy the details below and send them to the grower; RESTART reloads the page
          (the same as a manual refresh). The component names name the culprit; the
          bundle positions are secondary.
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => void this.copyDetails(details)}
            style={{ padding: '8px 14px', background: '#33ff33', color: '#09090b', fontWeight: 'bold', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'monospace' }}
          >
            {copied ? '✓ COPIED' : 'COPY ERROR DETAILS'}
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ padding: '8px 14px', background: '#e11d48', color: '#fff', fontWeight: 'bold', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'monospace' }}
          >
            RESTART THE GAME
          </button>
        </div>
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', userSelect: 'text', fontSize: 12, lineHeight: 1.5, margin: 0 }}>
          {details}
        </pre>
      </div>
    );
  }
}
