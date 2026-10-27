import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSetting, setSetting, type Person } from '../db';
import { useState } from 'react';
import { canManage } from '../session';
import { summarize } from '../logic';
import { formatMoney } from '../money';
import { today } from '../db';
import { BudgetCard } from './parts';

export default function Budgets({ me }: { me: Person }) {
  const manager = canManage(me);
  const data = useLiveQuery(async () => {
    let budgets = await db.budgets.orderBy('createdAt').reverse().toArray();
    if (!manager) budgets = budgets.filter((b) => b.assigneeId === me.id);
    return { budgets, expenses: await db.expenses.toArray(), church: await getSetting('churchName', ''), people: await db.people.count() };
  }, [me.id, manager]);
  if (!data) return null;

  const active = data.budgets.filter((b) => b.status === 'active');
  const closed = data.budgets.filter((b) => b.status === 'closed');
  const totals = active.reduce(
    (t, b) => {
      const s = summarize(b, data.expenses, today());
      return { given: t.given + s.allocated, left: t.left + s.left };
    },
    { given: 0, left: 0 },
  );

  return (
    <>
      <div className="hero">
        <small>{manager ? 'Left across all active budgets' : 'Left in your budgets'}</small>
        <div className="big">{formatMoney(totals.left)}</div>
        <small>of {formatMoney(totals.given)} given · {active.length} active budget{active.length === 1 ? '' : 's'}</small>
      </div>
      {manager && !data.church && <ChurchSetup />}
      {manager && data.church && data.people < 2 && (
        <div className="notice">Next: add your leaders and missionaries under <a href="#/more">More → Church and people</a>, then send each one an invite link.</div>
      )}
      {manager && <div className="actions"><a className="btn primary" href="#/new-budget">New budget</a></div>}
      {active.length === 0 && (
        <p className="muted">
          {manager ? 'No budgets yet. A budget must be set before expenses can be tracked. Create one, or load the demo data under More.' : 'No budget has been assigned to you yet. When your treasurer gives you one, they will send you a link to open.'}
        </p>
      )}
      {active.length > 0 && closed.length > 0 && <h2>Active</h2>}
      {active.map((b) => <BudgetCard key={b.id} budget={b} expenses={data.expenses} />)}
      {closed.length > 0 && <h2>Closed</h2>}
      {closed.map((b) => <BudgetCard key={b.id} budget={b} expenses={data.expenses} />)}
    </>
  );
}

/** First-run card for the treasurer: name the church, then invite people. */
function ChurchSetup() {
  const [name, setName] = useState('');
  return (
    <div className="card setup">
      <b>Set up your church</b>
      <p className="muted">Your church name appears on invites and budget reports.</p>
      <input aria-label="Church name" placeholder="e.g. Grace Community Church" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="actions"><button className="primary" disabled={!name.trim()} onClick={() => setSetting('churchName', name.trim())}>Save</button></div>
    </div>
  );
}
