import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Person } from '../db';
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
    return { budgets, expenses: await db.expenses.toArray() };
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
      <div className="card">
        <small className="muted">{manager ? 'Left across all active budgets' : 'Left in your budgets'}</small>
        <div className="big">{formatMoney(totals.left)}</div>
        <small className="muted">of {formatMoney(totals.given)} given</small>
      </div>
      <div className="actions">
        {manager && <a className="btn primary" href="#/new-budget">New budget</a>}
        <a className="btn" href="#/add">Add expense</a>
      </div>
      {active.length === 0 && (
        <p className="muted">
          {manager ? 'No budgets yet. A budget must be set before expenses can be tracked. Create one, or load the demo data under More.' : 'No budget has been assigned to you yet.'}
        </p>
      )}
      {active.map((b) => <BudgetCard key={b.id} budget={b} expenses={data.expenses} />)}
      {closed.length > 0 && <h2>Closed</h2>}
      {closed.map((b) => <BudgetCard key={b.id} budget={b} expenses={data.expenses} />)}
    </>
  );
}
