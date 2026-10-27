import { Component, type ReactNode } from 'react';

/** Unregisters the offline cache and reloads, for when an old cached copy of the app misbehaves. */
async function resetAndReload() {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = (await caches?.keys()) ?? [];
    await Promise.all(keys.map((k) => caches.delete(k)));
  } finally {
    location.reload();
  }
}

export function FatalScreen({ title, detail }: { title: string; detail: ReactNode }) {
  return (
    <div className="login">
      <img src="icon.svg" alt="" />
      <h1>{title}</h1>
      <div className="muted" style={{ textAlign: 'left' }}>{detail}</div>
      <button className="primary" onClick={() => location.reload()}>Try again</button>
      <button onClick={resetAndReload}>Clear the saved app and reload</button>
      <p className="muted"><small>Your budgets and expenses are not deleted by either button.</small></p>
    </div>
  );
}

export function StorageBlocked({ error }: { error: unknown }) {
  return (
    <FatalScreen
      title="This browser is blocking storage"
      detail={
        <>
          <p>ChMS Ledger saves your data on this phone, and this browser won't allow it. This usually happens when:</p>
          <ul>
            <li>the link was opened inside another app (WhatsApp, Facebook, Gmail). Open it in Chrome or Safari instead.</li>
            <li>the browser is in private or incognito mode.</li>
            <li>site data or cookies are turned off in the browser settings.</li>
          </ul>
          <p><small>Details: {String((error as Error)?.message ?? error)}</small></p>
        </>
      }
    />
  );
}

/** Shows a readable screen instead of a blank page if something in the app crashes. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return <FatalScreen title="Something went wrong" detail={<p>The app hit an error and stopped. Details: {this.state.error.message}</p>} />;
  }
}
