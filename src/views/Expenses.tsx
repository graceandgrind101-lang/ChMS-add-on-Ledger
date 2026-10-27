import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Expense, type Person } from '../db';
import { formatMoney } from '../money';
import { canManage } from '../session';
import { download, toCsv } from '../csv';
import { ExpenseActions, ExpenseRow } from './parts';

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected' | 'owed';
const STATUS_FILTERS: [StatusFilter, string][] = [['all', 'All'], ['pending', 'Waiting'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['owed', 'Payback owed']];

/** Find any expense by words, status, budget or dates. Non-managers search only their own. */
export default function Expenses({ me }: { me: Person }) {
  const manager = canManage(me);
  const data = useLiveQuery(async () => {
    let all = (await db.expenses.orderBy('createdAt').reverse().toArray()).filter((e) => e.status !== 'withdrawn');
    if (!manager) all = all.filter((e) => e.spenderId === me.id);
    const budgets = await db.budgets.orderBy('createdAt').reverse().toArray();
    return { all, budgets };
  }, [me.id, manager]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [budgetId, setBudgetId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  if (!data) return null;

  const budgets = new Map(data.budgets.map((b) => [b.id, b]));
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (e: Expense) => {
    if (status === 'owed' ? e.reimbursement !== 'owed' : status !== 'all' && e.status !== status) return false;
    if (budgetId && e.budgetId !== budgetId) return false;
    if (from && e.date < from) return false;
    if (to && e.date > to) return false;
    const text = [e.merchant, e.category, e.notes, e.spenderName, budgets.get(e.budgetId)?.name, (e.amount / 100).toFixed(2)].join(' ').toLowerCase();
    return words.every((w) => text.includes(w));
  };
  const found = data.all.filter(matches);
  const total = found.filter((e) => e.status === 'approved').reduce((n, e) => n + e.amount, 0);
  const filtered = !!(words.length || status !== 'all' || budgetId || from || to);

  function exportCsv() {
    download(`expenses-${new Date().toLocaleDateString('en-CA')}.csv`, toCsv(found.map((e) => ({
      Date: e.date, Budget: budgets.get(e.budgetId)?.name ?? '', Payee: e.merchant, Category: e.category, Amount: (e.amount / 100).toFixed(2),
      'Paid with': e.paidWith === 'own' ? 'Own money' : 'Budget funds', Person: e.spenderName, Status: e.status, Payback: e.reimbursement, Notes: e.notes,
    }))));
  }

  return (
    <>
      <input type="search" aria-label="Search expenses" placeholder="Search store, category, person, notes or amount" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chips filter-chips">
        {STATUS_FILTERS.map(([key, label]) => (
          <button key={key} type="button" className={`chip ${status === key ? 'on' : ''}`} onClick={() => setStatus(key)}>{label}</button>
        ))}
      </div>
      <details className="more-filters" open={!!(budgetId || from || to)}>
        <summary>Budget and dates</summary>
        <label htmlFor="fb">Budget</label>
        <select id="fb" value={budgetId} onChange={(e) => setBudgetId(e.target.value)}>
          <option value="">All budgets</option>
          {data.budgets.filter((b) => manager || b.assigneeId === me.id).map((b) => <option key={b.id} value={b.id}>{b.name} · {b.assigneeName}{b.status === 'closed' ? ' · closed' : ''}</option>)}
        </select>
        <div className="grid2">
          <div><label htmlFor="ff">From</label><input id="ff" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><label htmlFor="ft">To</label><input id="ft" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
      </details>
      <div className="row search-summary">
        <small className="muted">{found.length} expense{found.length === 1 ? '' : 's'} · {formatMoney(total)} approved</small>
        <span>
          {filtered && <button className="link" onClick={() => { setQ(''); setStatus('all'); setBudgetId(''); setFrom(''); setTo(''); }}>Clear</button>}
          {found.length > 0 && <button className="small-btn" onClick={exportCsv}>CSV</button>}
        </span>
      </div>
      {found.length === 0 && <p className="muted">{data.all.length === 0 ? 'No expenses yet.' : 'Nothing matches. Try fewer words or clear the filters.'}</p>}
      {found.map((e) => (
        <ExpenseRow key={e.id} e={e}>
          <small className="muted">{budgets.get(e.budgetId)?.name}{e.notes ? ` · ${e.notes}` : ''}</small>
          <ExpenseActions e={e} budget={budgets.get(e.budgetId)} me={me} />
        </ExpenseRow>
      ))}
    </>
  );
}
