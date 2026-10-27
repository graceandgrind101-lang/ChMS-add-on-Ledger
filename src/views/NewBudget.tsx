import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, today, uid, type Person, type Role } from '../db';
import { createBudget } from '../actions';
import { parseMoney, currencyCode } from '../money';
import { canManage, ROLE_LABEL } from '../session';
import { go } from '../router';

const NEW = '__new__';

export default function NewBudget({ me }: { me: Person }) {
  const people = useLiveQuery(() => db.people.orderBy('name').toArray(), [], []);
  const [f, setF] = useState({ name: '', purpose: '', assignee: '', newName: '', newRole: 'missionary' as Role, amount: '', start: today(), end: '' });
  const [error, setError] = useState('');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  if (!canManage(me)) return <p className="muted">Only an admin or treasurer can set budgets.</p>;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseMoney(f.amount);
    if (!f.name.trim()) return setError('Give the budget a name.');
    if (!amount || amount <= 0) return setError('Enter the amount the church is giving.');
    if (f.end && f.end < f.start) return setError('The end date is before the start date.');
    let assignee = people.find((p) => p.id === f.assignee);
    if (f.assignee === NEW || !assignee) {
      if (!f.newName.trim()) return setError('Choose who this budget is for.');
      assignee = { id: uid(), name: f.newName.trim(), role: f.newRole };
      await db.people.add(assignee);
    }
    const b = await createBudget({
      name: f.name.trim(), purpose: f.purpose.trim(), assigneeId: assignee.id, assigneeName: assignee.name,
      amount, startDate: f.start, endDate: f.end || undefined,
    }, me);
    go(`/budget/${b.id}`);
  }

  return (
    <form onSubmit={save}>
      <p className="muted">Set the amount the church gives a person, group, or task. Expenses are tracked against it.</p>
      {error && <div className="notice error">{error}</div>}
      <label htmlFor="bn">Budget name</label>
      <input id="bn" placeholder="e.g. Kenya mission trip" value={f.name} onChange={set('name')} />
      <label htmlFor="who">Given to</label>
      <select id="who" value={f.assignee} onChange={set('assignee')}>
        <option value="">Choose a person or group…</option>
        {people.map((p) => <option key={p.id} value={p.id}>{p.name} ({ROLE_LABEL[p.role]})</option>)}
        <option value={NEW}>+ Someone new</option>
      </select>
      {(f.assignee === NEW || (!f.assignee && people.length === 0)) && (
        <div className="grid2">
          <div><label htmlFor="nn">Name</label><input id="nn" value={f.newName} onChange={set('newName')} /></div>
          <div>
            <label htmlFor="nr">Role</label>
            <select id="nr" value={f.newRole} onChange={set('newRole')}>
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </div>
        </div>
      )}
      <label htmlFor="amt">Amount ({currencyCode()})</label>
      <input id="amt" inputMode="decimal" placeholder="2,000.00" value={f.amount} onChange={set('amount')} />
      <div className="grid2">
        <div><label htmlFor="st">Starts</label><input id="st" type="date" value={f.start} onChange={set('start')} /></div>
        <div><label htmlFor="en">Expires (optional)</label><input id="en" type="date" value={f.end} onChange={set('end')} /></div>
      </div>
      <label htmlFor="pp">What it is for</label>
      <textarea id="pp" placeholder="Travel, lodging and outreach supplies" value={f.purpose} onChange={set('purpose')} />
      <div className="actions"><button className="primary" type="submit">Create budget</button><a className="btn" href="#/">Cancel</a></div>
    </form>
  );
}
