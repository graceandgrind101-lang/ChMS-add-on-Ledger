import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, today, type Person } from '../db';
import { closeBudget, topUpBudget } from '../actions';
import { budgetAlerts, scoreCloseOut, summarize } from '../logic';
import { formatMoney, parseMoney, toInput } from '../money';
import { canManage } from '../session';
import { go } from '../router';
import { budgetEndEvent } from '../calendar';
import { download } from '../csv';
import { BudgetCard, ExpenseActions, ExpenseRow } from './parts';

export default function BudgetDetail({ id, me, receiptId }: { id: string; me: Person; receiptId?: string }) {
  const data = useLiveQuery(async () => ({
    budget: await db.budgets.get(id),
    expenses: (await db.expenses.where('budgetId').equals(id).reverse().sortBy('createdAt')).filter((e) => e.status !== 'withdrawn'),
    closeout: await db.closeouts.where('budgetId').equals(id).first(),
  }), [id]);
  const [panel, setPanel] = useState<'none' | 'topup' | 'close'>('none');

  if (!data) return null;
  const { budget, expenses, closeout } = data;
  if (!budget) return <p className="muted">This budget no longer exists. <a href="#/">Back to budgets</a></p>;
  const manager = canManage(me);
  const s = summarize(budget, expenses, today());
  const alerts = budgetAlerts(s, budget.status);

  return (
    <>
      {receiptId && <ReceiptViewer id={receiptId} onClose={() => go(`/budget/${id}`)} />}
      <BudgetCard budget={budget} expenses={expenses} link={false} />
      {budget.purpose && <p className="muted">{budget.purpose}</p>}
      <div className="card">
        <table>
          <tbody>
            <tr><td>Given</td><td className="num">{formatMoney(s.allocated)}</td></tr>
            <tr><td>Spent (approved)</td><td className="num">{formatMoney(s.approved)}</td></tr>
            <tr><td>Waiting for approval</td><td className="num">{formatMoney(s.pending)}</td></tr>
            <tr><td><b>Left</b></td><td className="num"><b>{formatMoney(s.left)}</b></td></tr>
            <tr><td>Period</td><td className="num">{budget.startDate} to {budget.endDate ?? 'no end date'}</td></tr>
          </tbody>
        </table>
      </div>
      {alerts.some((a) => a.tone === 'good') && <div className="notice">You're saving church money on this budget. Saved funds earn reward points when the budget is closed.</div>}

      {closeout && (
        <div className="card">
          <div className="row"><b>Close-out report</b><span className={`chip ${closeout.saved < 0 ? 'critical' : 'good'}`}>{closeout.badge}</span></div>
          <p>Spent {formatMoney(closeout.spent)} of {formatMoney(closeout.allocated)}. {closeout.saved >= 0 ? `Saved ${formatMoney(closeout.saved)} (${Math.round(closeout.savedPct * 100)}%), returned to the church.` : `Over by ${formatMoney(-closeout.saved)}.`}</p>
          <small className="muted">{closeout.note} {closeout.points > 0 && `${closeout.points} reward points.`}</small>
        </div>
      )}

      {budget.status === 'active' && (
        <div className="actions">
          <a className="btn primary" href={`#/add?budget=${budget.id}`}>Add expense</a>
          {manager && <button onClick={() => setPanel(panel === 'topup' ? 'none' : 'topup')}>Add funds</button>}
          {manager && <button onClick={() => setPanel(panel === 'close' ? 'none' : 'close')}>Close or reset</button>}
          <a className="btn" href={`#/ledger?budget=${budget.id}`}>Ledger</a>
          <a className="btn" href={`#/report/${budget.id}`}>Report</a>
          {budget.endDate && budget.endDate >= today() && (
            <button onClick={() => download(`${budget.name.replace(/[^\w]+/g, '-')}-ends.ics`, budgetEndEvent(budget, manager), 'text/calendar')}>Remind me in my calendar</button>
          )}
        </div>
      )}
      {budget.status === 'closed' && (
        <div className="actions">
          <a className="btn primary" href={`#/report/${budget.id}`}>Report (PDF)</a>
          <a className="btn" href={`#/ledger?budget=${budget.id}`}>Ledger</a>
        </div>
      )}
      {panel === 'topup' && <TopUp onDone={() => setPanel('none')} run={(amt, why) => topUpBudget(budget, amt, why, me)} />}
      {panel === 'close' && <ClosePanel budget={budget} spent={s.approved} pending={s.pending} me={me} onDone={() => setPanel('none')} />}

      <h2>Expenses</h2>
      {expenses.length === 0 && <p className="muted">No expenses yet.</p>}
      {expenses.map((e) => <ExpenseRow key={e.id} e={e}><ExpenseActions e={e} budget={budget} me={me} /></ExpenseRow>)}
    </>
  );
}

function TopUp({ run, onDone }: { run: (amount: number, why: string) => Promise<void>; onDone: () => void }) {
  const [amount, setAmount] = useState('');
  const [why, setWhy] = useState('');
  const cents = parseMoney(amount);
  return (
    <div className="card">
      <b>Add funds to this budget</b>
      <div className="grid2">
        <div><label htmlFor="ta">Amount</label><input id="ta" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div><label htmlFor="tw">Reason</label><input id="tw" value={why} onChange={(e) => setWhy(e.target.value)} /></div>
      </div>
      <div className="actions"><button className="primary" disabled={!cents || cents <= 0} onClick={async () => { await run(cents!, why); onDone(); }}>Add</button></div>
    </div>
  );
}

function ClosePanel({ budget, spent, pending, me, onDone }: { budget: import('../db').Budget; spent: number; pending: number; me: Person; onDone: () => void }) {
  const score = scoreCloseOut(budget.amount, spent);
  const [renew, setRenew] = useState(false);
  const [amount, setAmount] = useState(toInput(budget.amount));
  const [end, setEnd] = useState('');
  const [error, setError] = useState('');

  async function close() {
    try {
      const next = await closeBudget(budget, me, renew ? parseMoney(amount) : null, end || undefined);
      onDone();
      if (next) go(`/budget/${next.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="card">
      <b>Close out after the report</b>
      <p className="muted">
        Spent {formatMoney(spent)} of {formatMoney(budget.amount)}.{' '}
        {score.saved >= 0 ? `${formatMoney(score.saved)} goes back to the church.` : `Over by ${formatMoney(-score.saved)}; the church covers it.`}{' '}
        Result: <b>{score.badge}</b>{score.points > 0 ? `, ${score.points} reward points` : ''}.
      </p>
      {pending > 0 && <div className="notice error">{formatMoney(pending)} is still waiting for approval. Approve or reject it first.</div>}
      {error && <div className="notice error">{error}</div>}
      <label><input type="checkbox" style={{ width: 'auto', marginRight: 8 }} checked={renew} onChange={(e) => setRenew(e.target.checked)} />Reset: start a new round of this budget</label>
      {renew && (
        <div className="grid2">
          <div><label htmlFor="ra">New amount</label><input id="ra" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div><label htmlFor="re">Expires (optional)</label><input id="re" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
        </div>
      )}
      <div className="actions"><button className="primary" disabled={pending > 0} onClick={close}>{renew ? 'Close and reset' : 'Close budget'}</button><button onClick={onDone}>Cancel</button></div>
    </div>
  );
}

function ReceiptViewer({ id, onClose }: { id: string; onClose: () => void }) {
  const receipt = useLiveQuery(() => db.receipts.get(id), [id]);
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!receipt) return;
    const u = URL.createObjectURL(receipt.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [receipt]);
  return (
    <div className="card">
      <div className="row"><b>Receipt</b><button onClick={onClose}>Close</button></div>
      {url ? <img className="receipt" src={url} alt="Receipt" /> : <p className="muted">Receipt photo not found on this device.</p>}
    </div>
  );
}
