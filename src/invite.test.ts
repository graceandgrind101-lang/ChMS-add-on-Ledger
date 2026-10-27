import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, getSetting, setSetting, type Person } from './db';
import { addExpense, createBudget } from './actions';
import { acceptInvite, buildInvite, decodeInvite, encodeInvite } from './invite';

const treasurer: Person = { id: 't1', name: 'Pastor John', role: 'treasurer' };
const ruth: Person = { id: 'r1', name: 'Ruth Mensah', role: 'missionary' };

describe('invite links', () => {
  beforeEach(() => Promise.all(db.tables.map((t) => t.clear())));

  it("carries the person's budgets, and only theirs, to a new phone", async () => {
    await db.people.bulkAdd([treasurer, ruth, { id: 'd1', name: 'Daniel', role: 'leader' }]);
    await setSetting('churchName', 'Grace Community Church');
    await setSetting('currency', 'KES');
    const kenya = await createBudget({ name: 'Kenya', purpose: '', assigneeId: 'r1', assigneeName: 'Ruth Mensah', amount: 400000, startDate: '2026-10-01' }, treasurer);
    await createBudget({ name: 'VBS', purpose: '', assigneeId: 'd1', assigneeName: 'Daniel', amount: 80000, startDate: '2026-10-01' }, treasurer);
    await addExpense({ budgetId: kenya.id, date: '2026-10-02', merchant: 'Kenya Airways', category: 'Travel', amount: 168500, notes: '', paidWith: 'budget', spenderId: 'r1', spenderName: 'Ruth Mensah', source: 'email' }, treasurer, true);

    const code = await encodeInvite(await buildInvite(ruth, treasurer));
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);

    // Ruth's new phone.
    await Promise.all(db.tables.map((t) => t.clear()));
    const me = await acceptInvite(await decodeInvite(code));
    expect(me.name).toBe('Ruth Mensah');
    expect((await db.budgets.toArray()).map((b) => b.name)).toEqual(['Kenya']);
    expect(await db.expenses.count()).toBe(1);
    expect(await db.people.count()).toBe(2);
    expect(await getSetting('churchName', '')).toBe('Grace Community Church');
    expect(await getSetting('currency', 'USD')).toBe('KES');
  });

  it('rejects a damaged link', async () => {
    await expect(decodeInvite('not-a-real-code')).rejects.toThrow(/damaged/);
  });
});
