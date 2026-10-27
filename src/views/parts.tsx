import type { Budget, Expense, Person } from '../db';
import { canEditExpense, withdrawExpense } from '../actions';
import { budgetAlerts, summarize } from '../logic';
import { formatMoney } from '../money';
import { today } from '../db';
import { Ring } from '../icons';

export function BudgetCard({ budget, expenses, link = true }: { budget: Budget; expenses: Expense[]; link?: boolean }) {
  const s = summarize(budget, expenses, today());
  const alerts = budgetAlerts(s, budget.status);
  const body = (
    <>
      <div className="budget-row">
        <Ring pctLeft={s.allocated > 0 ? s.left / s.allocated : 0} over={s.left < 0} />
        <div className="budget-main">
          <div className="budget-name">{budget.name}</div>
          <small className="muted">{budget.assigneeName}{budget.cycle > 1 ? ` · round ${budget.cycle}` : ''}</small>
        </div>
        <div className="budget-money">
          <div className={s.left < 0 ? 'neg' : ''}>{formatMoney(s.left)}</div>
          <small className="muted">left of {formatMoney(s.allocated)}</small>
        </div>
      </div>
      <div className="chips">
        {budget.status === 'closed' && <span className="chip">Closed</span>}
        {s.pending > 0 && <span className="chip info">{formatMoney(s.pending)} waiting for approval</span>}
        {s.daysLeft !== null && s.daysLeft >= 7 && budget.status === 'active' && <span className="chip">{s.daysLeft} days left</span>}
        {alerts.map((a) => <span key={a.text} className={`chip ${a.tone}`}>{a.text}</span>)}
      </div>
    </>
  );
  return link ? <a className="card" href={`#/budget/${budget.id}`}>{body}</a> : <div className="card">{body}</div>;
}

export function StatusChip({ e }: { e: Expense }) {
  if (e.status === 'pending') return <span className="chip info">Waiting for approval</span>;
  if (e.status === 'withdrawn') return <span className="chip">Withdrawn</span>;
  if (e.status === 'rejected') return <span className="chip critical">Rejected{e.rejectReason ? `: ${e.rejectReason}` : ''}</span>;
  if (e.reimbursement === 'owed') return <span className="chip warning">Payback owed</span>;
  if (e.reimbursement === 'paid') return <span className="chip good">Paid back</span>;
  return <span className="chip good">Approved</span>;
}

export function ExpenseRow({ e, children }: { e: Expense; children?: React.ReactNode }) {
  return (
    <div className="list-item">
      <div className="row">
        <div>
          <div>{e.merchant || 'Expense'} <small className="muted">· {e.category}</small></div>
          <small className="muted">{e.date} · {e.spenderName}{e.paidWith === 'own' ? ' · paid from own pocket' : ''}</small>
        </div>
        <div style={{ fontWeight: 500 }}>{formatMoney(e.amount)}</div>
      </div>
      <div className="chips"><StatusChip e={e} />{e.receiptId && <a className="chip" href={`#/budget/${e.budgetId}?receipt=${e.receiptId}`}>Receipt</a>}</div>
      {children}
    </div>
  );
}

/** Edit and Withdraw for an expense that has not been approved yet. */
export function ExpenseActions({ e, budget, me }: { e: Expense; budget?: Budget; me: Person }) {
  if (!canEditExpense(e, budget, me)) return null;
  return (
    <div className="actions">
      <a className="btn small-btn" href={`#/add?edit=${e.id}`}>{e.status === 'rejected' ? 'Fix and resubmit' : 'Edit'}</a>
      <button className="small-btn" onClick={() => confirm('Withdraw this expense? It will no longer count against the budget.') && withdrawExpense(e)}>Withdraw</button>
    </div>
  );
}
