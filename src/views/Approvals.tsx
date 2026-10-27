import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Person } from '../db';
import { approveExpense, markReimbursed, rejectExpense } from '../actions';
import { formatMoney } from '../money';
import { canManage } from '../session';
import { ExpenseActions, ExpenseRow } from './parts';

export default function Approvals({ me }: { me: Person }) {
  const manager = canManage(me);
  const data = useLiveQuery(async () => {
    const all = (await db.expenses.orderBy('createdAt').reverse().toArray()).filter((e) => e.status !== 'withdrawn');
    const budgets = await db.budgets.toArray();
    return { all, names: new Map(budgets.map((b) => [b.id, b.name])), budgets: new Map(budgets.map((b) => [b.id, b])) };
  }, []);
  if (!data) return null;

  if (!manager) {
    const mine = data.all.filter((e) => e.spenderId === me.id);
    const owed = mine.filter((e) => e.reimbursement === 'owed').reduce((t, e) => t + e.amount, 0);
    return (
      <>
        <a className="btn search-link" href="#/expenses">Search my expenses</a>
        {owed > 0 && <div className="notice">The church owes you {formatMoney(owed)} for out-of-pocket expenses.</div>}
        {mine.length === 0 && <p className="muted">You haven't submitted any expenses yet.</p>}
        {mine.map((e) => (
          <ExpenseRow key={e.id} e={e}>
            <small className="muted">{data.names.get(e.budgetId)}</small>
            <ExpenseActions e={e} budget={data.budgets.get(e.budgetId)} me={me} />
          </ExpenseRow>
        ))}
      </>
    );
  }

  const pending = data.all.filter((e) => e.status === 'pending');
  const owed = data.all.filter((e) => e.reimbursement === 'owed');
  const owedTotal = owed.reduce((t, e) => t + e.amount, 0);

  return (
    <>
      <a className="btn search-link" href="#/expenses">Search all expenses</a>
      <h2>Waiting for approval ({pending.length})</h2>
      {pending.length === 0 && <p className="muted">Nothing to approve.</p>}
      {pending.map((e) => (
        <ExpenseRow key={e.id} e={e}>
          <small className="muted">{data.names.get(e.budgetId)}{e.notes ? ` · ${e.notes}` : ''}</small>
          <div className="actions">
            <button className="primary" onClick={() => approveExpense(e, me)}>Approve</button>
            <button className="danger" onClick={() => {
              const reason = prompt('Why is this expense rejected?');
              if (reason !== null) rejectExpense(e, reason, me);
            }}>Reject</button>
          </div>
        </ExpenseRow>
      ))}

      <h2>Paybacks owed ({formatMoney(owedTotal)})</h2>
      <p className="muted">Approved expenses people paid from their own pocket.</p>
      {owed.length === 0 && <p className="muted">No one is waiting to be paid back.</p>}
      {owed.map((e) => (
        <ExpenseRow key={e.id} e={e}>
          <small className="muted">{data.names.get(e.budgetId)}</small>
          <div className="actions"><button onClick={() => markReimbursed(e, me)}>Mark paid back</button></div>
        </ExpenseRow>
      ))}
    </>
  );
}
