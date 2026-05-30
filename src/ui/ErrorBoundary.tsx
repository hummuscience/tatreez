import React from 'react';

/**
 * Renders an on-screen error report when a child throws during render or in
 * an event handler. React forwards the real Error object to us via
 * componentDidCatch, so we get the full message and stack — unlike
 * `window.onerror`, which Safari can censor to "Script error." even for
 * same-origin scripts when the error happens inside an event handler.
 *
 * Wrap the whole app so any tab/component crash becomes a readable banner
 * the user can screenshot, instead of a frozen UI or a blank page.
 */
interface State {
  err: Error | null;
  info: string | null;
}

interface Props {
  children: React.ReactNode;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { err: null, info: null };

  static getDerivedStateFromError(err: Error): State {
    return { err, info: null };
  }

  componentDidCatch(err: Error, info: React.ErrorInfo): void {
    // `componentStack` is the React tree breadcrumb — invaluable for figuring
    // out which tab/component blew up on a remote device.
    this.setState({ err, info: info.componentStack ?? null });
  }

  reset = (): void => this.setState({ err: null, info: null });

  render(): React.ReactNode {
    const { err, info } = this.state;
    if (!err) return this.props.children;
    const text = `${err.name}: ${err.message}\n\n${err.stack ?? '(no stack)'}\n\nComponent stack:${info ?? '\n(none)'}`;
    return (
      <div style={errStyle.wrap}>
        <h1 style={errStyle.h1}>Tatreez hit an error</h1>
        <p style={errStyle.p}>
          Screenshot this and send it along. Tap “Try again” to keep going.
        </p>
        <pre style={errStyle.pre}>{text}</pre>
        <p style={errStyle.ua}>UA: {navigator.userAgent}</p>
        <button type="button" style={errStyle.btn} onClick={this.reset}>
          Try again
        </button>
      </div>
    );
  }
}

const errStyle = {
  wrap: {
    font: '14px/1.5 -apple-system,system-ui,sans-serif',
    padding: 20,
    maxWidth: 760,
    margin: '20px auto',
    color: '#1a1a1a',
  } as React.CSSProperties,
  h1: { fontSize: 18, margin: '0 0 8px', color: '#9a0029' } as React.CSSProperties,
  p: { margin: '0 0 12px', color: '#555' } as React.CSSProperties,
  pre: {
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    background: '#fff7ea',
    border: '1px solid #e0c89a',
    borderRadius: 6,
    padding: 12,
    font: '12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace',
  } as React.CSSProperties,
  ua: {
    margin: '12px 0 0',
    font: '11px/1.4 ui-monospace,monospace',
    color: '#777',
  } as React.CSSProperties,
  btn: {
    marginTop: 12,
    padding: '8px 14px',
    fontSize: 13,
    background: '#9a0029',
    color: '#fff',
    border: 0,
    borderRadius: 6,
  } as React.CSSProperties,
};
