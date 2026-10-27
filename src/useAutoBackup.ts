import { useEffect, useRef } from 'react';
import Dexie from 'dexie';
import { db, setSetting } from './db';
import { backupToDrive, hasToken } from './google';

/**
 * Backs up to the signed-in user's Google Drive a short while after data changes,
 * and again when the device comes back online. Does nothing when not signed in.
 */
export function useAutoBackup(online: boolean) {
  const timer = useRef<number>();
  const dirty = useRef(false);

  useEffect(() => {
    const run = async () => {
      if (!navigator.onLine || !hasToken() || !dirty.current) return;
      dirty.current = false;
      try {
        await setSetting('device.lastBackup', await backupToDrive());
      } catch {
        dirty.current = true;
      }
    };
    const onChange = (parts: Record<string, unknown>) => {
      // Ignore our own bookkeeping writes to device settings.
      if (Object.keys(parts).every((k) => k.includes('/settings/'))) return;
      dirty.current = true;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(run, 15_000);
    };
    Dexie.on('storagemutated', onChange);
    if (online) run();
    return () => {
      Dexie.on('storagemutated').unsubscribe(onChange);
      window.clearTimeout(timer.current);
    };
  }, [online]);
}
