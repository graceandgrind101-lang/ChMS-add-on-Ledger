import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSetting, setSetting, uid, type Person, type Role } from '../db';
import { exportSnapshot, importSnapshot, mergeSnapshot } from '../backup';
import { backupToDrive, CLIENT_ID, hasToken, restoreFromDrive, signIn, signOut, type GoogleProfile } from '../google';
import { toCsv, download, shareOrDownload } from '../csv';
import { formatMoney } from '../money';
import { loadSampleData } from '../sample';
import { canManage, linkSamePerson, ROLE_LABEL, setMe } from '../session';
import { getTheme, setTheme, type Theme } from '../theme';
import { inviteLink } from '../invite';

export default function More({ me }: { me: Person }) {
  return (
    <>
      <Rewards />
      <Appearance />
      <Account me={me} />
      {canManage(me) && <People me={me} />}
      <Data me={me} />
    </>
  );
}

/** Points come from closed budgets: the more church money someone saves, the more they earn. */
function Rewards() {
  const board = useLiveQuery(async () => {
    const by = new Map<string, { name: string; points: number; saved: number; badges: string[] }>();
    for (const c of await db.closeouts.toArray()) {
      const key = c.assigneeId ?? c.assigneeName;
      const row = by.get(key) ?? { name: c.assigneeName, points: 0, saved: 0, badges: [] };
      row.points += c.points;
      row.saved += Math.max(0, c.saved);
      if (c.points > 0 && !row.badges.includes(c.badge)) row.badges.push(c.badge);
      by.set(key, row);
    }
    return [...by.values()].sort((a, b) => b.points - a.points);
  }, [], []);
  return (
    <>
      <h2>Stewardship rewards</h2>
      <p className="muted">Earned when a budget is closed. Saving 10% earns Faithful steward, 25% earns Wise saver.</p>
      {board.length === 0 && <p className="muted">No budgets closed yet.</p>}
      {board.length > 0 && (
        <div className="card">
          <table>
            <thead><tr><th className="rank">#</th><th>Name</th><th className="num">Saved</th><th className="num">Points</th></tr></thead>
            <tbody>
              {board.map((r, i) => (
                <tr key={r.name}>
                  <td className="rank">{i + 1}</td>
                  <td>{r.name}<div className="chips">{r.badges.map((b) => <span key={b} className="chip good">{b}</span>)}</div></td>
                  <td className="num">{formatMoney(r.saved)}</td>
                  <td className="num">{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Appearance() {
  const [theme, set] = useState<Theme>(getTheme);
  const choose = (t: Theme) => {
    setTheme(t);
    set(t);
  };
  return (
    <>
      <h2>Appearance</h2>
      <div className="seg" role="group" aria-label="Color theme">
        <button className={theme === 'light' ? 'on' : ''} onClick={() => choose('light')}>Light</button>
        <button className={theme === 'dark' ? 'on' : ''} onClick={() => choose('dark')}>Dark</button>
        <button className={theme === 'system' ? 'on' : ''} onClick={() => choose('system')}>Match device</button>
      </div>
    </>
  );
}

function Account({ me }: { me: Person }) {
  const google = useLiveQuery(() => getSetting<GoogleProfile | null>('device.google', null), [], null);
  const lastBackup = useLiveQuery(() => getSetting<string | null>('device.lastBackup', null), [], null);
  const people = useLiveQuery(() => db.people.orderBy('name').toArray(), [], []);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ text: label });
    } catch (e) {
      setMsg({ text: (e as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  }
  const ensureToken = async () => {
    if (!hasToken()) await setSetting('device.google', await signIn(true));
  };

  return (
    <>
      <h2>Account and backup</h2>
      <div className="card">
        <div className="row">
          <div>
            <div>{me.name}</div>
            <small className="muted">{ROLE_LABEL[me.role]}{google ? ` · ${google.email}` : ' · not signed in to Google'}</small>
          </div>
        </div>
        {msg && <div className={`notice ${msg.error ? 'error' : ''}`}>{msg.text}</div>}
        {google ? (
          <>
            <p className="muted"><small>Backs up to your Google Drive automatically when online. Last backup: {lastBackup ? new Date(lastBackup).toLocaleString() : 'not yet'}.</small></p>
            <div className="actions">
              <button disabled={busy} onClick={() => run('Backed up to Google Drive.', async () => { await ensureToken(); await setSetting('device.lastBackup', await backupToDrive()); })}>Back up now</button>
              <button disabled={busy} onClick={() => confirm('Replace the data on this device with your Google Drive backup?') && run('Restored from Google Drive.', async () => { await ensureToken(); await restoreFromDrive(); })}>Restore</button>
              <button onClick={async () => { signOut(); await db.settings.delete('device.google'); }}>Disconnect Google</button>
            </div>
          </>
        ) : CLIENT_ID ? (
          <div className="actions"><button disabled={busy} onClick={() => run('Signed in. Backups are on.', async () => setSetting('device.google', await signIn()))}>Sign in with Google to back up</button></div>
        ) : (
          <p className="muted"><small>Google backup turns on once the app has a Google client ID (see README). Until then, use "Save backup file" below.</small></p>
        )}
        <label htmlFor="as">Using the app as (for demos and shared devices)</label>
        <select id="as" value={me.id} onChange={(e) => setMe(e.target.value)}>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name} · {ROLE_LABEL[p.role]}</option>)}
        </select>
      </div>
    </>
  );
}

/** Sends a person their invite link through the phone's share sheet, or copies it. */
async function sendInvite(person: Person, me: Person): Promise<string> {
  const url = await inviteLink(person, me);
  const church = await getSetting('churchName', '');
  const text = `Hi ${person.name.split(' ')[0]}, ${church ? `${church} uses` : "we're using"} ChMS Ledger to track ministry budgets and receipts. Open this link on your phone to join:`;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Join ChMS Ledger', text, url });
      return `Invite sent to ${person.name}.`;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return '';
    }
  }
  await navigator.clipboard.writeText(`${text} ${url}`);
  return `Invite link for ${person.name} copied. Paste it into WhatsApp, a text or an email.`;
}

function People({ me }: { me: Person }) {
  const people = useLiveQuery(() => db.people.orderBy('name').toArray(), [], []);
  const church = useLiveQuery(() => getSetting('churchName', ''), [], '');
  const [msg, setMsg] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('missionary');
  const admins = people.filter(canManage).length;
  return (
    <>
      <h2>Church and people</h2>
      <label htmlFor="church-name">Church name</label>
      <input id="church-name" key={church} defaultValue={church} placeholder="e.g. Grace Community Church" onBlur={(e) => setSetting('churchName', e.target.value.trim())} />
      <p className="muted"><small>Add each leader, volunteer or missionary, give them a budget, then send their invite link. Opening it sets up their phone with their budgets. Send it again any time to share new budgets.</small></p>
      {msg && <div className="notice">{msg}</div>}
      <div className="card">
        {people.map((p) => (
          <div key={p.id} className="row list-item">
            <div>{p.name}{p.email && <div><small className="muted">{p.email}</small></div>}</div>
            {p.id !== me.id && <button className="small" onClick={async () => setMsg(await sendInvite(p, me).catch((e: Error) => e.message))}>Invite</button>}
            <select style={{ width: 'auto' }} value={p.role} disabled={p.id === me.id && canManage(p) && admins === 1}
              onChange={(e) => db.people.update(p.id, { role: e.target.value as Role })}>
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </div>
        ))}
        <div className="grid2">
          <div><label htmlFor="pn">Name</label><input id="pn" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label htmlFor="pe">Google email (optional)</label><input id="pe" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        </div>
        <label htmlFor="pr">Role</label>
        <select id="pr" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
        <div className="actions">
          <button disabled={!name.trim()} onClick={async () => { await db.people.add({ id: uid(), name: name.trim(), email: email.trim() || undefined, role }); setName(''); setEmail(''); }}>Add person</button>
        </div>
      </div>
    </>
  );
}

function Data({ me }: { me: Person }) {
  const [msg, setMsg] = useState('');
  async function exportExpenses() {
    const budgets = new Map((await db.budgets.toArray()).map((b) => [b.id, b.name]));
    const rows = (await db.expenses.orderBy('createdAt').toArray()).map((e) => ({
      Date: e.date, Budget: budgets.get(e.budgetId) ?? '', Payee: e.merchant, Category: e.category, Amount: (e.amount / 100).toFixed(2),
      'Paid with': e.paidWith === 'own' ? 'Own money' : 'Budget funds', Person: e.spenderName, Status: e.status,
      Payback: e.reimbursement, 'Approved by': e.decidedBy ?? '', Notes: e.notes,
    }));
    download(`expenses-${new Date().toLocaleDateString('en-CA')}.csv`, toCsv(rows));
  }
  async function sendUpdates() {
    const name = me.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await shareOrDownload(`ledger-updates-${name}-${new Date().toLocaleDateString('en-CA')}.json`, JSON.stringify(await exportSnapshot()), 'application/json');
  }
  async function receiveUpdates(file?: File) {
    if (!file) return;
    try {
      const r = await mergeSnapshot(JSON.parse(await file.text()));
      await linkSamePerson(me);
      setMsg(r.added || r.updated ? `Updates received: ${r.added} new, ${r.updated} changed.` : 'Already up to date.');
    } catch (e) {
      setMsg((e as Error).message);
    }
  }
  async function saveFile() {
    download(`chms-ledger-backup-${new Date().toLocaleDateString('en-CA')}.json`, JSON.stringify(await exportSnapshot()), 'application/json');
  }
  async function openFile(file?: File) {
    if (!file || !confirm('Replace the data on this device with this backup file?')) return;
    try {
      await importSnapshot(JSON.parse(await file.text()));
      setMsg('Backup restored.');
    } catch (e) {
      setMsg((e as Error).message);
    }
  }
  return (
    <>
      <h2>Share with your team</h2>
      <p className="muted">Send your expenses to the treasurer, or send approvals and budgets back, by WhatsApp or email. Opening a received file adds the changes without erasing anything.</p>
      {msg && <div className="notice">{msg}</div>}
      <div className="actions">
        <button className="primary" onClick={sendUpdates}>Send updates</button>
        <label className="btn" style={{ margin: 0, color: 'var(--blue)' }}>Receive updates<input type="file" accept="application/json,.json" hidden onChange={(e) => { receiveUpdates(e.target.files?.[0]); e.target.value = ''; }} /></label>
      </div>
      <h2>Data</h2>
      <div className="actions">
        <button onClick={exportExpenses}>Expenses as CSV</button>
        <a className="btn" href="#/ledger">Ledger as CSV</a>
        <button onClick={saveFile}>Save backup file</button>
        <label className="btn" style={{ margin: 0, color: 'var(--blue)' }}>Restore backup file<input type="file" accept="application/json" hidden onChange={(e) => openFile(e.target.files?.[0])} /></label>
      </div>
      {canManage(me) && (
        <div className="actions">
          <button onClick={async () => { await loadSampleData(me); setMsg('Demo data added.'); }}>Load demo data</button>
          <button className="danger" onClick={async () => {
            if (!confirm('Erase everything on this device? Make a backup first.')) return;
            await db.delete();
            location.reload();
          }}>Erase this device</button>
        </div>
      )}
      <p className="muted"><small>ChMS Ledger keeps your data on this device first, so it works without internet.</small></p>
    </>
  );
}
