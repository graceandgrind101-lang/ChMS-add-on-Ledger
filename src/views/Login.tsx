import { useState } from 'react';
import { db, setSetting, uid, type Person } from '../db';
import { CLIENT_ID, lastDriveBackup, restoreFromDrive, signIn } from '../google';
import { setMe } from '../session';
import { GoogleLogo } from '../icons';

/**
 * First screen. Google sign-in links the device to the user's Drive backup; if a backup
 * exists it is restored, which is how a new phone picks up where the old one left off.
 */
export default function Login() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');

  async function startWith(person: Omit<Person, 'id'>) {
    const existing = person.email ? await db.people.filter((p) => p.email === person.email).first() : undefined;
    const me = existing ?? { ...person, id: uid() };
    if (!existing) await db.people.add(me);
    await setMe(me.id);
  }

  async function google() {
    setBusy(true);
    setError('');
    try {
      const profile = await signIn();
      await setSetting('device.google', profile);
      if (await lastDriveBackup()) {
        await restoreFromDrive();
        await setSetting('device.lastBackup', new Date().toISOString());
      }
      const firstUser = (await db.people.count()) === 0;
      await startWith({ name: profile.name, email: profile.email, role: firstUser ? 'admin' : 'volunteer' });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function local() {
    if (!name.trim()) return setError('Enter your name to continue.');
    await startWith({ name: name.trim(), role: 'admin' });
  }

  return (
    <div className="login">
      <img src="icon.svg" alt="" />
      <h1>ChMS Ledger</h1>
      <p className="muted">Budgets, receipts and paybacks for church ministry teams. Works without internet.</p>
      {error && <div className="notice error">{error}</div>}
      {CLIENT_ID && (
        <>
          <button className="google-btn" onClick={google} disabled={busy}><GoogleLogo />{busy ? 'Signing in…' : 'Sign in with Google'}</button>
          <p className="muted"><small>Your data is saved on this device and backed up to your own Google Drive.</small></p>
          <div className="divider"><span>or</span></div>
        </>
      )}
      <label htmlFor="name" style={{ textAlign: 'left' }}>Use without Google (this device only)</label>
      <input id="name" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && local()} />
      <button className="primary" onClick={local}>Continue on this device</button>
    </div>
  );
}
