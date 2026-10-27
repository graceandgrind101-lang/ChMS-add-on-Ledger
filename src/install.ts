import { useEffect, useState } from 'react';

/** Chrome's install event; not in TypeScript's DOM types yet. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// The browser fires this once, early, so it is captured at startup (see main.tsx) and kept here.
let deferred: InstallPromptEvent | null = null;
let justInstalled = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function captureInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    justInstalled = true;
    notify();
  });
}

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** installed: running as the app. added: just installed from this browser tab. */
export type InstallState = 'installed' | 'added' | 'ready' | 'ios' | 'manual';

/** Whether the app is installed, can be installed with one tap, or needs the browser's menu. */
export function useInstall() {
  const read = (): InstallState => (isStandalone() ? 'installed' : justInstalled ? 'added' : deferred ? 'ready' : isIOS() ? 'ios' : 'manual');
  const [state, setState] = useState(read);
  useEffect(() => {
    const on = () => setState(read());
    listeners.add(on);
    return () => void listeners.delete(on);
  }, []);
  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === 'accepted') deferred = null;
    notify();
  }
  return { state, install };
}
