import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { formatMoney } from '../money';
import { toCsv, download } from '../csv';
import { go } from '../router';

const KIND_LABEL = { allocation: 'Budget given', expense: 'Expense', reimbursement: 'Payback', return: 'Returned', 'top-up': 'Funds added' };

export default function Ledger({ budgetId }: { budgetId?: string }) {
  const data = useLiveQuery(async () => ({
    budgets: await db.budgets.orderBy('createdAt').reverse().toArray(),
    entries: (budgetId ? await db.ledger.where('budgetId').equals(budgetId).toArray() : await db.ledger.toArray())
      // By date, then in the order recorded, so the running balance reads like a bank statement.
      .sort((a, b) => a.date.localeCompare(b.date) || (a.seq ?? 0) - (b.seq ?? 0)),
  }), [budgetId]);
  if (!data) return null;

  const names = new Map(data.budgets.map((b) => [b.id, `${b.name} (${b.assigneeName})`]));
  let balance = 0;
  const rows = data.entries.map((e) => {
    balance += e.moneyIn - e.moneyOut;
    return { ...e, balance };
  });

  function exportCsv() {
    download(`ledger-${new Date().toLocaleDateString('en-CA')}.csv`, toCsv(rows.map((r) => ({
      Date: r.date, Budget: names.get(r.budgetId) ?? '', Type: KIND_LABEL[r.kind], Description: r.description,
      In: (r.moneyIn / 100).toFixed(2), Out: (r.moneyOut / 100).toFixed(2), 'Paid back': r.memoAmount ? (r.memoAmount / 100).toFixed(2) : '',
      Balance: (r.balance / 100).toFixed(2), 'Recorded by': r.by,
    }))));
  }

  return (
    <>
      <p className="muted">Every budget given, expense approved, payback, and return, in order. Balance is money still held in {budgetId ? 'this budget' : 'all budgets'}.</p>
      <label htmlFor="lb">Show</label>
      <select id="lb" value={budgetId ?? ''} onChange={(e) => go(e.target.value ? `/ledger?budget=${e.target.value}` : '/ledger')}>
        <option value="">All budgets</option>
        {data.budgets.map((b) => <option key={b.id} value={b.id}>{names.get(b.id)}{b.status === 'closed' ? ' · closed' : ''}</option>)}
      </select>
      <div className="actions"><button onClick={exportCsv} disabled={!rows.length}>Download for spreadsheet (CSV)</button></div>
      {rows.length === 0 ? <p className="muted">No entries yet.</p> : (
        <div className="card">
          {[...rows].reverse().map((r) => (
            <div key={r.id} className="list-item">
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <div>
                  <div>{r.description}</div>
                  <small className="muted">{r.date} · {KIND_LABEL[r.kind]}{budgetId ? '' : ` · ${names.get(r.budgetId) ?? ''}`} · by {r.by}</small>
                </div>
                <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {r.moneyIn > 0 && <div style={{ color: 'var(--green)', fontWeight: 500 }}>+{formatMoney(r.moneyIn)}</div>}
                  {r.moneyOut > 0 && <div style={{ fontWeight: 500 }}>−{formatMoney(r.moneyOut)}</div>}
                  {r.memoAmount !== undefined && <div className="muted">{formatMoney(r.memoAmount)} paid back</div>}
                  <small className="muted">Balance {formatMoney(r.balance)}</small>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
