import { useState } from 'react';
import { db, setSetting, uid, type Person } from '../db';
import { CLIENT_ID, lastDriveBackup, restoreFromDrive, signIn } from '../google';
import { setMe } from '../session';
import { GoogleLogo, Icon } from '../icons';
import { startDemo } from '../demo';
import { go } from '../router';

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
    <div className="login start">
      <div className="welcome">
        <img src="icon.svg" alt="" />
        <h1>ChMS Ledger</h1>
        <p>Budgets, receipts and paybacks for church ministry teams.</p>
      </div>
      <ul className="features">
        <li><span><Icon name="wallet" /></span>Give each leader or trip its own budget</li>
        <li><span><Icon name="camera" /></span>Snap receipts; the amount fills itself in</li>
        <li><span><Icon name="check" /></span>Approve spending and track paybacks</li>
      </ul>
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
      <div className="divider"><span>or</span></div>
      <button className="demo-btn" onClick={() => startDemo()}>Try the demo</button>
      <p className="muted"><small>A guided tour with an example church. Exit the demo any time to clear it.</small></p>
      <details className="paste-invite">
        <summary>Have an invite link?</summary>
        <p className="muted"><small>If the link opened in your browser instead of the app, copy it and paste it here.</small></p>
        <input aria-label="Invite link" placeholder="Paste the invite link" onChange={(e) => {
          const code = e.target.value.match(/[?&]i=([A-Za-z0-9_-]+)/)?.[1];
          if (code) go(`/join?i=${code}`);
        }} />
      </details>
      <p className="legal"><a href="privacy.html">Privacy</a> · <a href="terms.html">Terms</a></p>
    </div>
  );
}
