import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { canManage, useMe } from './session';
import { useOnline, useRoute } from './router';
import { useAutoBackup } from './useAutoBackup';
import Login from './views/Login';
import Budgets from './views/Budgets';
import BudgetDetail from './views/BudgetDetail';
import NewBudget from './views/NewBudget';
import AddExpense from './views/AddExpense';
import Ledger from './views/Ledger';
import Approvals from './views/Approvals';
import More from './views/More';

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
  useAutoBackup(online);

  if (!ready) return <p className="muted" style={{ padding: 16 }}>Loading…</p>;
  if (!me) return <Login />;

  let view;
  let title = 'Budgets';
  switch (parts[0]) {
    case 'budget':
      view = <BudgetDetail id={parts[1]} me={me} receiptId={params.get('receipt') ?? undefined} />;
      title = 'Budget';
      break;
    case 'new-budget':
      view = <NewBudget me={me} />;
      title = 'New budget';
      break;
    case 'add':
      view = <AddExpense me={me} budgetId={params.get('budget') ?? undefined} />;
      title = 'Add expense';
      break;
    case 'ledger':
      view = <Ledger budgetId={params.get('budget') ?? undefined} />;
      title = 'Ledger';
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
  const tab = parts[0] === 'budget' || parts[0] === 'new-budget' || !parts[0] ? 'budgets' : parts[0];

  return (
    <>
      <header className="top">
        <h1>{title}</h1>
        {!online && <span className="offline">Offline, saved on this device</span>}
      </header>
      <main>{view}</main>
      <nav className="tabs">
        <a href="#/" className={tab === 'budgets' ? 'on' : ''}><span className="ico">▤</span>Budgets</a>
        <a href="#/add" className={tab === 'add' ? 'on' : ''}><span className="ico">＋</span>Add</a>
        <a href="#/ledger" className={tab === 'ledger' ? 'on' : ''}><span className="ico">☰</span>Ledger</a>
        <a href="#/approvals" className={tab === 'approvals' ? 'on' : ''}>
          <span className="ico">✓</span>{canManage(me) ? 'Approvals' : 'Mine'}
          {canManage(me) && waiting > 0 && <span className="count">{waiting}</span>}
        </a>
        <a href="#/more" className={tab === 'more' ? 'on' : ''}><span className="ico">⋯</span>More</a>
      </nav>
    </>
  );
}
