import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, type Person } from './db';
import { addExpense, approveExpense, canEditExpense, createBudget, rejectExpense, updateExpense, withdrawExpense } from './actions';
import { summarize } from './logic';

const treasurer: Person = { id: 't1', name: 'Pastor John', role: 'treasurer' };
const ruth: Person = { id: 'r1', name: 'Ruth', role: 'missionary' };
const daniel: Person = { id: 'd1', name: 'Daniel', role: 'leader' };

async function setup() {
  const budget = await createBudget({ name: 'Kenya', purpose: '', assigneeId: 'r1', assigneeName: 'Ruth', amount: 100000, startDate: '2026-10-01' }, treasurer);
  const expense = await addExpense({ budgetId: budget.id, date: '2026-10-02', merchant: 'Taxi', category: 'Transport', amount: 2000, notes: '', paidWith: 'budget', spenderId: 'r1', spenderName: 'Ruth', source: 'manual' }, ruth, false);
  return { budget, expense };
}

describe('changing an expense before approval', () => {
  beforeEach(() => Promise.all(db.tables.map((t) => t.clear())));

  it('lets the spender and managers edit until it is approved', async () => {
    const { budget, expense } = await setup();
    expect(canEditExpense(expense, budget, ruth)).toBe(true);
    expect(canEditExpense(expense, budget, treasurer)).toBe(true);
    expect(canEditExpense(expense, budget, daniel)).toBe(false);
    await approveExpense(expense, treasurer);
    const approved = (await db.expenses.get(expense.id))!;
    expect(canEditExpense(approved, budget, ruth)).toBe(false);
    await expect(updateExpense(approved, { amount: 1 })).rejects.toThrow();
  });

  it('sends a fixed rejected expense back for approval', async () => {
    const { expense } = await setup();
    await rejectExpense(expense, 'No receipt', treasurer);
    await updateExpense((await db.expenses.get(expense.id))!, { amount: 2500 });
    const fixed = (await db.expenses.get(expense.id))!;
    expect(fixed.status).toBe('pending');
    expect(fixed.amount).toBe(2500);
    expect(fixed.rejectReason).toBeUndefined();
  });

  it('withdrawn expenses stop counting against the budget', async () => {
    const { budget, expense } = await setup();
    await withdrawExpense(expense);
    const s = summarize(budget, await db.expenses.toArray(), '2026-10-03');
    expect(s.pending).toBe(0);
    expect(s.left).toBe(100000);
    expect((await db.expenses.get(expense.id))!.status).toBe('withdrawn');
  });
});
