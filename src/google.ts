// Google sign-in and backup to the user's own Google Drive (the hidden app data folder,
// like WhatsApp backups). Needs VITE_GOOGLE_CLIENT_ID; without it the app runs local-only.
import { exportSnapshot, importSnapshot, type Snapshot } from './backup';

export const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const SCOPES = 'openid email profile https://www.googleapis.com/auth/drive.appdata';
const FILE_NAME = 'chms-ledger-backup.json';

export interface GoogleProfile {
  email: string;
  name: string;
  picture?: string;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(cfg: { client_id: string; scope: string; prompt?: string; callback: (r: TokenResponse) => void }): {
            requestAccessToken(opts?: { prompt?: string }): void;
          };
          revoke(token: string, done: () => void): void;
        };
      };
    };
  }
}

let token: { value: string; expires: number } | null = null;

function loadScript(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not reach Google. Check the internet connection.'));
    document.head.appendChild(s);
  });
}

export function hasToken() {
  return !!token && token.expires > Date.now() + 60_000;
}

/** Opens Google's sign-in popup. `silent` reuses an earlier consent without showing a prompt when possible. */
export async function signIn(silent = false): Promise<GoogleProfile> {
  if (!CLIENT_ID) throw new Error('Google sign-in is not set up yet (missing VITE_GOOGLE_CLIENT_ID).');
  await loadScript();
  const resp = await new Promise<TokenResponse>((resolve) => {
    const client = window.google!.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: SCOPES, callback: resolve });
    client.requestAccessToken({ prompt: silent ? '' : 'select_account' });
  });
  if (!resp.access_token) throw new Error(resp.error || 'Google sign-in was cancelled.');
  token = { value: resp.access_token, expires: Date.now() + (resp.expires_in ?? 3600) * 1000 };
  const me = await api('https://www.googleapis.com/oauth2/v3/userinfo');
  return { email: me.email, name: me.name, picture: me.picture };
}

export function signOut() {
  if (token && window.google) window.google.accounts.oauth2.revoke(token.value, () => {});
  token = null;
}

async function api(url: string, init: RequestInit = {}) {
  if (!hasToken()) throw new Error('Google session expired. Sign in again to back up.');
  const res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token!.value}` } });
  if (!res.ok) throw new Error(`Google Drive error ${res.status}`);
  return res.status === 204 ? null : res.json();
}

async function findBackup(): Promise<{ id: string; modifiedTime: string } | null> {
  const q = encodeURIComponent(`name='${FILE_NAME}'`);
  const r = await api(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)`);
  return r.files?.[0] ?? null;
}

export async function backupToDrive(): Promise<string> {
  const snap = await exportSnapshot();
  const existing = await findBackup();
  const meta = existing ? {} : { name: FILE_NAME, parents: ['appDataFolder'] };
  const body = new FormData();
  body.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
  body.append('file', new Blob([JSON.stringify(snap)], { type: 'application/json' }));
  const url = existing
    ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
  await api(url, { method: existing ? 'PATCH' : 'POST', body });
  return snap.exportedAt;
}

/** Returns the backup time, or null when this Google account has no backup yet. */
export async function lastDriveBackup(): Promise<string | null> {
  return (await findBackup())?.modifiedTime ?? null;
}

export async function restoreFromDrive() {
  const existing = await findBackup();
  if (!existing) throw new Error('No backup found in this Google account.');
  const snap = (await api(`https://www.googleapis.com/drive/v3/files/${existing.id}?alt=media`)) as Snapshot;
  await importSnapshot(snap);
}
