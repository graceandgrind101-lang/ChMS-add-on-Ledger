import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, today, uid, type Expense, type Person } from '../db';
import { addExpense } from '../actions';
import { parseReceiptText } from '../logic';
import { formatMoney, parseMoney, toInput } from '../money';
import { compressImage, readReceipt } from '../ocr';
import { canManage } from '../session';
import { go } from '../router';
import { Icon } from '../icons';

const CATEGORIES = ['Travel', 'Lodging', 'Food', 'Ministry supplies', 'Transport', 'Venue', 'Printing', 'Gifts', 'Medical', 'Other'];

export default function AddExpense({ me, budgetId }: { me: Person; budgetId?: string }) {
  const manager = canManage(me);
  const budgets = useLiveQuery(async () => {
    const all = await db.budgets.where('status').equals('active').toArray();
    return manager ? all : all.filter((b) => b.assigneeId === me.id);
  }, [me.id, manager]);

  const [source, setSource] = useState<Expense['source']>('camera');
  const [image, setImage] = useState<Blob | null>(null);
  const [preview, setPreview] = useState('');
  const [ocr, setOcr] = useState<{ state: 'idle' | 'reading' | 'done' | 'failed'; pct: number; text: string }>({ state: 'idle', pct: 0, text: '' });
  const [emailText, setEmailText] = useState('');
  const [f, setF] = useState({ budgetId: budgetId ?? '', amount: '', date: today(), merchant: '', category: '', paidWith: 'budget' as Expense['paidWith'], notes: '' });
  const [error, setError] = useState('');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    if (!f.budgetId && budgets?.length === 1) setF((x) => ({ ...x, budgetId: budgets[0].id }));
  }, [budgets, f.budgetId]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function fill(found: { merchant?: string; date?: string; total?: number }) {
    setF((x) => ({
      ...x,
      merchant: found.merchant ?? x.merchant,
      date: found.date ?? x.date,
      amount: found.total !== undefined ? toInput(found.total) : x.amount,
    }));
  }

  async function onFile(file: File | undefined, from: Expense['source']) {
    if (!file) return;
    setSource(from);
    const small = await compressImage(file).catch(() => file);
    setImage(small);
    setPreview(URL.createObjectURL(small));
    setOcr({ state: 'reading', pct: 0, text: '' });
    try {
      const found = await readReceipt(small, (pct) => setOcr((o) => ({ ...o, pct })));
      fill(found);
      setOcr({ state: 'done', pct: 100, text: found.text });
    } catch {
      setOcr({ state: 'failed', pct: 0, text: '' });
    }
  }

  function readEmail() {
    fill(parseReceiptText(emailText));
    setOcr({ state: 'done', pct: 100, text: emailText });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const budget = budgets?.find((b) => b.id === f.budgetId);
    const amount = parseMoney(f.amount);
    if (!budget) return setError('Choose the budget this expense belongs to.');
    if (!amount || amount <= 0) return setError('Enter the amount.');
    let receiptId: string | undefined;
    if (image) {
      receiptId = uid();
      await db.receipts.add({ id: receiptId, blob: image });
    }
    const spender = manager && budget.assigneeId !== me.id
      ? { spenderId: budget.assigneeId, spenderName: budget.assigneeName }
      : { spenderId: me.id, spenderName: me.name };
    await addExpense({
      budgetId: budget.id, date: f.date, merchant: f.merchant.trim(), category: f.category || 'Other', amount,
      notes: f.notes.trim(), paidWith: f.paidWith, ...spender, receiptId, ocrText: ocr.text || undefined, source: image || emailText ? source : 'manual',
    }, me, manager);
    go(`/budget/${budget.id}`);
  }

  if (!budgets) return null;
  if (budgets.length === 0) {
    return <p className="muted">{manager ? <>There is no active budget yet. <a href="#/new-budget">Set a budget first</a>, then add expenses to it.</> : 'No active budget is assigned to you yet. Ask your treasurer to set one.'}</p>;
  }
  const chosen = budgets.find((b) => b.id === f.budgetId);

  return (
    <form onSubmit={save}>
      <div className="capture">
        <label className={source === 'camera' && image ? 'on' : ''}>
          <Icon name="camera" size={28} />Take photo<input type="file" accept="image/*" capture="environment" onChange={(e) => onFile(e.target.files?.[0], 'camera')} /></label>
        <label className={source === 'gallery' && image ? 'on' : ''}>
          <Icon name="image" size={28} />Upload<input type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0], 'gallery')} /></label>
        <label className={source === 'email' ? 'on' : ''} onClick={(e) => { e.preventDefault(); setSource('email'); }}>
          <Icon name="mail" size={28} />Email receipt
        </label>
      </div>

      {source === 'email' && !image && (
        <>
          <label htmlFor="em">Paste the text of an emailed or online receipt</label>
          <textarea id="em" value={emailText} onChange={(e) => setEmailText(e.target.value)} placeholder="Copy the receipt email and paste it here" />
          <div className="actions"><button type="button" onClick={readEmail} disabled={!emailText.trim()}>Read details</button></div>
          <small className="muted">For a PDF or screenshot receipt, use Upload instead.</small>
        </>
      )}
      {preview && <img className="receipt" src={preview} alt="Receipt" />}
      {ocr.state === 'reading' && <div className="notice">Reading receipt… {ocr.pct}%</div>}
      {ocr.state === 'done' && <div className="notice">Details filled in from the receipt. Please check them.</div>}
      {ocr.state === 'failed' && <div className="notice error">Couldn't read this receipt{navigator.onLine ? '' : ' while offline the first time'}. The photo is kept; type the details below.</div>}
      {error && <div className="notice error">{error}</div>}

      <label htmlFor="bud">Budget</label>
      <select id="bud" value={f.budgetId} onChange={set('budgetId')}>
        <option value="">Choose…</option>
        {budgets.map((b) => <option key={b.id} value={b.id}>{b.name} · {b.assigneeName}</option>)}
      </select>
      {chosen && <small className="muted">Budget amount {formatMoney(chosen.amount)}</small>}
      <div className="grid2">
        <div><label htmlFor="amt">Amount (USD)</label><input id="amt" inputMode="decimal" value={f.amount} onChange={set('amount')} placeholder="0.00" /></div>
        <div><label htmlFor="dt">Date</label><input id="dt" type="date" value={f.date} onChange={set('date')} /></div>
      </div>
      <label htmlFor="mer">Store or payee</label>
      <input id="mer" value={f.merchant} onChange={set('merchant')} />
      <label htmlFor="cat">Category</label>
      <select id="cat" value={f.category} onChange={set('category')}>
        <option value="">Choose…</option>
        {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
      </select>
      <label>Paid with</label>
      <div className="seg">
        <button type="button" className={f.paidWith === 'budget' ? 'on' : ''} onClick={() => setF({ ...f, paidWith: 'budget' })}>Budget funds</button>
        <button type="button" className={f.paidWith === 'own' ? 'on' : ''} onClick={() => setF({ ...f, paidWith: 'own' })}>Own money (pay me back)</button>
      </div>
      <label htmlFor="nt">Notes</label>
      <input id="nt" value={f.notes} onChange={set('notes')} />
      <div className="actions">
        <button className="primary" type="submit">{manager ? 'Save' : 'Submit for approval'}</button>
        <a className="btn" href="#/">Cancel</a>
      </div>
    </form>
  );
}
