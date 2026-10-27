import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSetting, setSetting, today, type Person } from '../db';
import { scoreCloseOut, spendByCategory, summarize } from '../logic';
import { formatMoney } from '../money';
import { canManage } from '../session';

const STATUS_LABEL = { approved: 'Approved', pending: 'Waiting', rejected: 'Rejected' };

/** A one-page budget report to print or save as PDF when the person reports back. */
export default function Report({ id, me }: { id: string; me: Person }) {
  const data = useLiveQuery(async () => ({
    budget: await db.budgets.get(id),
    expenses: (await db.expenses.where('budgetId').equals(id).toArray()).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt),
    closeout: await db.closeouts.where('budgetId').equals(id).first(),
    church: await getSetting('churchName', ''),
  }), [id]);
  if (!data) return null;
  const { budget, expenses, closeout, church } = data;
  if (!budget) return <p className="muted">This budget no longer exists. <a href="#/">Back to budgets</a></p>;

  const s = summarize(budget, expenses, today());
  // An open budget is scored as if closed today, so leaders can preview the result.
  const result = closeout ?? { ...scoreCloseOut(budget.amount, s.approved), allocated: budget.amount, spent: s.approved };
  const categories = spendByCategory(expenses);
  const owed = expenses.filter((e) => e.reimbursement === 'owed').reduce((n, e) => n + e.amount, 0);

  return (
    <>
      <div className="actions no-print">
        <button className="primary" onClick={() => window.print()}>Print or save as PDF</button>
        <a className="btn" href={`#/budget/${budget.id}`}>Back to budget</a>
      </div>
      {canManage(me) && (
        <div className="no-print">
          <label htmlFor="church">Church name on reports</label>
          <input id="church" defaultValue={church} placeholder="e.g. Grace Community Church" onBlur={(e) => setSetting('churchName', e.target.value.trim())} />
        </div>
      )}

      <article className="report">
        <header>
          {church && <div className="church">{church}</div>}
          <h2>Budget report: {budget.name}</h2>
          <div className="muted">
            Given to {budget.assigneeName} · {budget.startDate} to {budget.endDate ?? 'no end date'}
            {budget.cycle > 1 && ` · round ${budget.cycle}`} · {closeout ? `closed ${new Date(closeout.closedAt).toLocaleDateString('en-CA')}` : 'still open'}
          </div>
          {budget.purpose && <p>{budget.purpose}</p>}
        </header>

        <div className="report-totals">
          <div><small>Given</small><b>{formatMoney(result.allocated)}</b></div>
          <div><small>Spent</small><b>{formatMoney(result.spent)}</b></div>
          <div className={result.saved < 0 ? 'neg' : 'pos'}>
            <small>{result.saved < 0 ? 'Over budget' : closeout ? 'Returned' : 'Left'}</small>
            <b>{formatMoney(Math.abs(result.saved))}</b>
          </div>
        </div>

        <p className="report-result">
          <span className={`chip ${result.saved < 0 ? 'critical' : 'good'}`}>{result.badge}</span>{' '}
          {result.saved >= 0
            ? `${Math.round(result.savedPct * 100)}% of the budget ${closeout ? 'was saved' : 'is unspent so far'}.`
            : `Spending went over by ${formatMoney(-result.saved)}.`}
          {result.points > 0 && ` ${result.points} reward points${closeout ? '' : ' if closed today'}.`}
        </p>
        {s.pending > 0 && <p className="notice">{formatMoney(s.pending)} is still waiting for approval and is not counted above.</p>}
        {owed > 0 && <p className="notice">The church still owes {formatMoney(owed)} in paybacks for out-of-pocket spending.</p>}

        {categories.length > 0 && (
          <>
            <h3>Where the money went</h3>
            <table className="report-table">
              <tbody>
                {categories.map((c) => (
                  <tr key={c.category}>
                    <td>{c.category}</td>
                    <td className="bar-cell"><span className="bar" style={{ width: `${Math.round((c.total / Math.max(result.spent, 1)) * 100)}%` }} /></td>
                    <td className="num">{formatMoney(c.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <h3>Expenses</h3>
        {expenses.length === 0 ? <p className="muted">No expenses recorded.</p> : (
          <table className="report-table">
            <thead><tr><th>Date</th><th>Paid to</th><th>For</th><th className="by">By</th><th>Status</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} className={e.status === 'rejected' ? 'struck' : ''}>
                  <td className="nowrap">{e.date}</td>
                  <td>{e.merchant || '—'}{e.receiptId ? ' 🧾' : ''}</td>
                  <td>{e.category}</td>
                  <td className="by">{e.spenderName}{e.paidWith === 'own' ? ' (own money)' : ''}</td>
                  <td>{STATUS_LABEL[e.status]}</td>
                  <td className="num">{formatMoney(e.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={4}>Total approved</td><td className="by" /><td className="num">{formatMoney(s.approved)}</td></tr></tfoot>
          </table>
        )}
        <small className="muted">🧾 receipt photo on file. Rejected expenses are crossed out and not counted.</small>

        <div className="signatures">
          <div><span />Reported by ({budget.assigneeName})</div>
          <div><span />Reviewed by (treasurer)</div>
          <div><span />Date</div>
        </div>
        <small className="muted">Made with ChMS Ledger on {today()}.</small>
      </article>
    </>
  );
}
