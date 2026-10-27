import { db, today, uid, type Budget, type Expense, type LedgerEntry, type Person } from './db';
import { formatMoney, type Cents } from './money';
import { scoreCloseOut } from './logic';
import { canManage } from './session';

function post(entry: Omit<LedgerEntry, 'id' | 'createdAt'>) {
  return db.ledger.add({ ...entry, id: uid(), createdAt: Date.now() });
}

export async function createBudget(input: Omit<Budget, 'id' | 'status' | 'cycle' | 'createdAt'> & { cycle?: number }, by: Person) {
  const budget: Budget = { ...input, id: uid(), status: 'active', cycle: input.cycle ?? 1, createdAt: Date.now() };
  await db.transaction('rw', db.budgets, db.ledger, async () => {
    await db.budgets.add(budget);
    await post({
      date: budget.startDate, budgetId: budget.id, kind: 'allocation',
      description: `Budget given to ${budget.assigneeName}: ${budget.name}`, moneyIn: budget.amount, moneyOut: 0, by: by.name,
    });
  });
  return budget;
}

/** Raises a budget's amount, for when the church sends more money. */
export async function topUpBudget(budget: Budget, amount: Cents, reason: string, by: Person) {
  await db.transaction('rw', db.budgets, db.ledger, async () => {
    await db.budgets.update(budget.id, { amount: budget.amount + amount });
    await post({ date: today(), budgetId: budget.id, kind: 'top-up', description: reason || 'Extra funds added', moneyIn: amount, moneyOut: 0, by: by.name });
  });
}

export async function addExpense(input: Omit<Expense, 'id' | 'status' | 'reimbursement' | 'createdAt'>, by: Person, autoApprove: boolean) {
  const expense: Expense = { ...input, id: uid(), status: 'pending', reimbursement: 'none', createdAt: Date.now() };
  await db.expenses.add(expense);
  if (autoApprove) await approveExpense(expense, by);
  return expense;
}

export async function approveExpense(expense: Expense, by: Person) {
  await db.transaction('rw', db.expenses, db.ledger, async () => {
    await db.expenses.update(expense.id, {
      status: 'approved', decidedBy: by.name, decidedAt: Date.now(),
      reimbursement: expense.paidWith === 'own' ? 'owed' : 'none',
    });
    await post({
      date: expense.date, budgetId: expense.budgetId, kind: 'expense', expenseId: expense.id,
      description: `${expense.merchant || 'Expense'} (${expense.category})${expense.paidWith === 'own' ? `, paid by ${expense.spenderName}` : ''}`,
      moneyIn: 0, moneyOut: expense.amount, by: by.name,
    });
  });
}

/** Who may still change an expense: its spender or a manager, until it is approved. */
export function canEditExpense(expense: Expense, budget: Budget | undefined, me: Person) {
  const open = expense.status === 'pending' || expense.status === 'rejected';
  return open && budget?.status === 'active' && (canManage(me) || expense.spenderId === me.id);
}

/** Saves changes to an unapproved expense. A rejected one goes back for approval. */
export async function updateExpense(expense: Expense, changes: Partial<Pick<Expense, 'budgetId' | 'date' | 'merchant' | 'category' | 'amount' | 'notes' | 'paidWith' | 'receiptId' | 'ocrText' | 'source'>>) {
  if (expense.status === 'approved' || expense.status === 'withdrawn') throw new Error('Approved expenses can no longer be changed.');
  await db.expenses.update(expense.id, { ...changes, status: 'pending', rejectReason: undefined, decidedBy: undefined, decidedAt: undefined });
}

/** Takes back an unapproved expense. It stays on record as withdrawn rather than being deleted. */
export async function withdrawExpense(expense: Expense) {
  if (expense.status === 'approved') throw new Error('Approved expenses can no longer be withdrawn.');
  await db.expenses.update(expense.id, { status: 'withdrawn' });
}

export function rejectExpense(expense: Expense, reason: string, by: Person) {
  return db.expenses.update(expense.id, { status: 'rejected', rejectReason: reason, decidedBy: by.name, decidedAt: Date.now() });
}

export async function markReimbursed(expense: Expense, by: Person) {
  await db.transaction('rw', db.expenses, db.ledger, async () => {
    await db.expenses.update(expense.id, { reimbursement: 'paid' });
    await post({
      date: today(), budgetId: expense.budgetId, kind: 'reimbursement', expenseId: expense.id,
      description: `Paid back ${expense.spenderName} ${formatMoney(expense.amount)} for ${expense.merchant || 'expense'}`,
      moneyIn: 0, moneyOut: 0, memoAmount: expense.amount, by: by.name,
    });
  });
}

/**
 * Closes a budget after the person reports back: unspent money goes back to the church,
 * the result is scored for rewards, and optionally a fresh budget starts (a reset).
 */
export async function closeBudget(budget: Budget, by: Person, renewAmount: Cents | null, renewEndDate?: string) {
  const expenses = await db.expenses.where('budgetId').equals(budget.id).toArray();
  if (expenses.some((e) => e.status === 'pending')) throw new Error('Approve or reject the pending expenses first.');
  const spent = expenses.filter((e) => e.status === 'approved').reduce((t, e) => t + e.amount, 0);
  const score = scoreCloseOut(budget.amount, spent);

  await db.transaction('rw', db.budgets, db.ledger, db.closeouts, async () => {
    if (score.saved > 0) {
      await post({ date: today(), budgetId: budget.id, kind: 'return', description: `Unspent funds returned to church`, moneyIn: 0, moneyOut: score.saved, by: by.name });
    } else if (score.saved < 0) {
      await post({ date: today(), budgetId: budget.id, kind: 'top-up', description: `Overspend covered by church`, moneyIn: -score.saved, moneyOut: 0, by: by.name });
    }
    await db.budgets.update(budget.id, { status: 'closed' });
    await db.closeouts.add({
      id: uid(), budgetId: budget.id, assigneeId: budget.assigneeId, assigneeName: budget.assigneeName,
      closedAt: Date.now(), allocated: budget.amount, spent, ...score,
    });
  });

  if (renewAmount !== null) {
    return createBudget({
      name: budget.name, purpose: budget.purpose, assigneeId: budget.assigneeId, assigneeName: budget.assigneeName,
      amount: renewAmount, startDate: today(), endDate: renewEndDate, cycle: budget.cycle + 1, previousId: budget.id,
    }, by);
  }
  return null;
}
