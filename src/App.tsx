import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSetting, today } from './db';
import { canManage, useMe } from './session';
import { useOnline, useRoute } from './router';
import { useAutoBackup } from './useAutoBackup';
import { Icon } from './icons';
import Login from './views/Login';
import Budgets from './views/Budgets';
import BudgetDetail from './views/BudgetDetail';
import NewBudget from './views/NewBudget';
import AddExpense from './views/AddExpense';
import Ledger from './views/Ledger';
import Approvals from './views/Approvals';
import More from './views/More';
import Report from './views/Report';
import Tour from './Tour';
import Join from './views/Join';
import Expenses from './views/Expenses';
import { isDemo } from './demo';
import { setCurrency } from './money';
import { reminders } from './logic';
import { useEffect } from 'react';

export default function App() {
  const me = useMe();
  const ready = useLiveQuery(() => db.settings.get('device.meId').then(() => true));
  const { parts, params } = useRoute();
  const online = useOnline();
  const waiting = useLiveQuery(async () => {
    const pending = await db.expenses.where('status').equals('pending').count();
    const owed = await db.expenses.where('reimbursement').equals('owed').count();
    return pending + owed;
  }, [], 0);
  const demo = useLiveQuery(isDemo, [], false);
  const currency = useLiveQuery(() => getSetting('currency', 'USD'), [], 'USD');
  setCurrency(currency);
  // The installed app's icon shows how many things need attention (Android, iOS 16.4+, desktop).
  const attention = useLiveQuery(async () => {
    if (!me) return 0;
    const manager = canManage(me);
    const budgets = (await db.budgets.where('status').equals('active').toArray()).filter((b) => manager || b.assigneeId === me.id);
    return reminders(budgets, await db.expenses.toArray(), today(), manager).length;
  }, [me?.id, me?.role], 0);
  useEffect(() => {
    if (!('setAppBadge' in navigator)) return;
    (attention ? navigator.setAppBadge(attention) : navigator.clearAppBadge()).catch(() => {});
  }, [attention]);
  useAutoBackup(online);

  if (!ready) return <p className="muted" style={{ padding: 16 }}>Loading…</p>;
  if (parts[0] === 'join' && params.get('i')) return <Join code={params.get('i')!} me={me} />;
  if (!me) return <Login />;

  let view;
  let title = 'Budgets';
  switch (parts[0]) {
    case 'budget':
      view = <BudgetDetail id={parts[1]} me={me} receiptId={params.get('receipt') ?? undefined} />;
      title = 'Budget';
      break;
    case 'report':
      view = <Report id={parts[1]} me={me} />;
      title = 'Report';
      break;
    case 'new-budget':
      view = <NewBudget me={me} />;
      title = 'New budget';
      break;
    case 'add':
      view = <AddExpense key={params.get('edit') ?? 'new'} me={me} budgetId={params.get('budget') ?? undefined} editId={params.get('edit') ?? undefined} />;
      title = params.get('edit') ? 'Edit expense' : 'Add expense';
      break;
    case 'ledger':
      view = <Ledger budgetId={params.get('budget') ?? undefined} />;
      title = 'Ledger';
      break;
    case 'expenses':
      view = <Expenses me={me} />;
      title = 'Search expenses';
      break;
    case 'approvals':
      view = <Approvals me={me} />;
      title = canManage(me) ? 'Approvals' : 'My expenses';
      break;
    case 'more':
      view = <More me={me} />;
      title = 'More';
      break;
    default:
      view = <Budgets me={me} />;
  }
  const tab = parts[0] === 'expenses' ? 'approvals' : parts[0] === 'budget' || parts[0] === 'report' || parts[0] === 'new-budget' || !parts[0] ? 'budgets' : parts[0];
  // Pages opened from another page get a back arrow instead of being a tab of their own.
  const sub = parts[0] === 'expenses' || parts[0] === 'budget' || parts[0] === 'report' || parts[0] === 'new-budget' || parts[0] === 'add';
  const showFab = !parts[0] || (parts[0] === 'budget' && parts[1]);

  return (
    <>
      <header className="top">
        {sub && (
          <button className="icon-btn" aria-label="Back" onClick={() => (history.length > 1 ? history.back() : (location.hash = '#/'))}>
            <Icon name="back" />
          </button>
        )}
        <h1>{title}</h1>
        {!online && <span className="offline"><Icon name="offline" size={16} /> Offline</span>}
      </header>
      {demo && <Tour />}
      <main key={currency}>{view}</main>
      {showFab && (
        <a className="fab" href={parts[0] === 'budget' ? `#/add?budget=${parts[1]}` : '#/add'} aria-label="Add expense">
          <Icon name="add" size={28} />
        </a>
      )}
      <nav className="tabs">
        <a href="#/" className={tab === 'budgets' ? 'on' : ''}><span className="pill"><Icon name="wallet" /></span>Budgets</a>
        <a href="#/ledger" className={tab === 'ledger' ? 'on' : ''}><span className="pill"><Icon name="receipt" /></span>Ledger</a>
        <a href="#/approvals" className={tab === 'approvals' ? 'on' : ''}>
          <span className="pill"><Icon name="check" />{canManage(me) && waiting > 0 && <span className="count">{waiting}</span>}</span>
          {canManage(me) ? 'Approvals' : 'Mine'}
        </a>
        <a href="#/more" className={tab === 'more' ? 'on' : ''}><span className="pill"><Icon name="more" /></span>More</a>
      </nav>
    </>
  );
}
