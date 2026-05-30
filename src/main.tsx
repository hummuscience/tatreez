import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

// Surface any startup crash on the page itself — without this, a thrown
// error during mount or a module-init exception leaves a blank white page,
// which is impossible to diagnose on iPad/iPhone where the console isn't
// readily accessible. Anything caught here gets dumped into #root so the
// user can read it and screenshot it for us.
function showFatal(stage: string, err: unknown): void {
  const root = document.getElementById('root');
  const msg =
    err instanceof Error
      ? `${err.name}: ${err.message}\n\n${err.stack ?? ''}`
      : String(err);
  const safe = msg.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!));
  const ua = navigator.userAgent;
  const block = `
    <div style="font:14px/1.5 -apple-system,system-ui,sans-serif;padding:20px;max-width:760px;margin:20px auto;color:#1a1a1a;">
      <h1 style="font-size:18px;margin:0 0 8px;color:#9a0029;">Tatreez failed to start (${stage})</h1>
      <p style="margin:0 0 12px;color:#555;">Please screenshot this and send it along.</p>
      <pre style="white-space:pre-wrap;word-break:break-word;background:#fff7ea;border:1px solid #e0c89a;border-radius:6px;padding:12px;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;">${safe}</pre>
      <p style="margin:12px 0 0;font:11px/1.4 ui-monospace,monospace;color:#777;">UA: ${ua.replace(/[<>&]/g, '')}</p>
    </div>`;
  if (root) root.innerHTML = block;
  else document.body.insertAdjacentHTML('beforeend', block);
}

// Catch errors that escape React's render path (module init, async tasks).
window.addEventListener('error', (e) => showFatal('window.error', e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => showFatal('promise', e.reason));

try {
  const host = document.getElementById('root');
  if (!host) throw new Error('#root element missing in index.html');
  ReactDOM.createRoot(host).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
} catch (err) {
  showFatal('mount', err);
}
