import { useEffect, useState } from 'react';
import { db, setSetting, type Budget, type Person } from '../db';
import { acceptInvite, decodeInvite, type Invite } from '../invite';
import { CLIENT_ID, lastDriveBackup, restoreFromDrive, signIn } from '../google';
import { linkSamePerson, ROLE_LABEL, setMe } from '../session';
import { formatMoney } from '../money';
import { go } from '../router';
import { GoogleLogo } from '../icons';

/** Opened from an invite link: shows who invited you and to what, then sets up this phone. */
export default function Join({ code, me }: { code: string; me?: Person }) {
  const [invite, setInvite] = useState<Invite | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    decodeInvite(code).then(setInvite, (e: Error) => setError(e.message));
  }, [code]);

  if (error) return <div className="login"><h1>Invite link</h1><div className="notice error">{error}</div><a className="btn" href="#/">Open the app</a></div>;
  if (!invite) return <p className="muted" style={{ padding: 16 }}>Opening invite…</p>;

  const person = invite.people.find((p) => p.id === invite.personId)!;
  const from = invite.people.find((p) => p.id !== invite.personId);
  const budgets = (invite.data.budgets as Budget[]).filter((b) => b.status === 'active');
  const switching = me && me.id !== person.id;

  async function join(withGoogle: boolean) {
    setBusy(true);
    setError('');
    try {
      let email: string | undefined;
      if (withGoogle) {
        const profile = await signIn();
        email = profile.email;
        await setSetting('device.google', profile);
        // A returning user on a new phone gets their own backup back first, then the invite on top.
        if (!me && (await lastDriveBackup())) {
          await restoreFromDrive();
          await setSetting('device.lastBackup', new Date().toISOString());
        }
      }
      const joined = await acceptInvite(invite!);
      if (email && !joined.email) await db.people.update(joined.id, { email });
      await setMe(joined.id);
      await linkSamePerson((await db.people.get(joined.id))!);
      go('/');
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <img src="icon.svg" alt="" />
      {invite.church && <div className="church-name">{invite.church}</div>}
      <h1>You're invited, {person.name.split(' ')[0]}</h1>
      <p className="muted">
        {from ? `${from.name} invited you` : 'You were invited'} to track church budgets as <b>{ROLE_LABEL[person.role]}</b>.
      </p>
      {budgets.length > 0 && (
        <div className="card join-budgets">
          {budgets.map((b) => (
            <div key={b.id} className="row"><span>{b.name}</span><b>{formatMoney(b.amount)}</b></div>
          ))}
        </div>
      )}
      {switching && <div className="notice">This phone is set up for {me!.name}. Joining switches it to {person.name}; nothing already here is deleted.</div>}
      {error && <div className="notice error">{error}</div>}
      {CLIENT_ID && (
        <>
          <button className="google-btn" disabled={busy} onClick={() => join(true)}><GoogleLogo />Join with Google</button>
          <p className="muted"><small>Backs up to your own Google Drive so you never lose receipts.</small></p>
        </>
      )}
      <button className={CLIENT_ID ? '' : 'primary'} disabled={busy} onClick={() => join(false)}>{CLIENT_ID ? 'Join on this phone only' : 'Join'}</button>
    </div>
  );
}
