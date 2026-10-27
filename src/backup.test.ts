import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, type Person } from './db';
import { addExpense, approveExpense, createBudget } from './actions';
import { mergeSnapshot, type Snapshot } from './backup';
import { linkSamePerson } from './session';

const treasurer: Person = { id: 't1', name: 'Pastor John', role: 'treasurer' };

// exportSnapshot needs FileReader (browser only); these tests have no receipts, so build it directly.
async function snapshot(): Promise<Snapshot> {
  const data: Record<string, unknown[]> = {};
  for (const t of ['people', 'budgets', 'expenses', 'ledger', 'closeouts']) data[t] = await db.table(t).toArray();
  data.receipts = [];
  return { app: 'chms-ledger', version: 1, exportedAt: '', data };
}

async function wipe() {
  await Promise.all(db.tables.map((t) => t.clear()));
}

describe('sharing updates between phones', () => {
  beforeEach(wipe);

  it('round-trips a budget, a submitted expense and its approval', async () => {
    // Treasurer's phone: set up Ruth's budget and send it.
    await db.people.bulkAdd([treasurer, { id: 'r1', name: 'Ruth Mensah', role: 'missionary' }]);
    const budget = await createBudget({ name: 'Kenya', purpose: '', assigneeId: 'r1', assigneeName: 'Ruth Mensah', amount: 100000, startDate: '2026-10-01' }, treasurer);
    const fromTreasurer = await snapshot();

    // Ruth's phone: signed in by name, receives the file, becomes the treasurer's "Ruth".
    await wipe();
    const localRuth: Person = { id: 'local', name: 'ruth mensah', role: 'admin' };
    await db.people.add(localRuth);
    await db.settings.put({ key: 'device.meId', value: 'local' });
    expect(await mergeSnapshot(fromTreasurer)).toMatchObject({ added: 4 });
    expect(await linkSamePerson(localRuth)).toBe(true);
    expect((await db.settings.get('device.meId'))?.value).toBe('r1');
    expect(await db.people.get('local')).toBeUndefined();
    const ruth = (await db.people.get('r1'))!;
    expect(ruth.role).toBe('missionary');
    const exp = await addExpense({ budgetId: budget.id, date: '2026-10-05', merchant: 'Bus', category: 'Travel', amount: 2500, notes: '', paidWith: 'own', spenderId: ruth.id, spenderName: ruth.name, source: 'manual' }, ruth, false);
    const fromRuth = await snapshot();

    // Treasurer's phone again: receives Ruth's expense, approves it.
    await wipe();
    await mergeSnapshot(fromTreasurer);
    expect(await mergeSnapshot(fromRuth)).toEqual({ added: 1, updated: 0 });
    await approveExpense((await db.expenses.get(exp.id))!, treasurer);
    const approvals = await snapshot();

    // Ruth's phone: the approval and its ledger line arrive; her older copy is replaced.
    await wipe();
    await mergeSnapshot(fromRuth);
    expect(await mergeSnapshot(approvals)).toEqual({ added: 1, updated: 1 });
    expect((await db.expenses.get(exp.id))?.status).toBe('approved');
    expect((await db.expenses.get(exp.id))?.reimbursement).toBe('owed');
    expect(await db.ledger.count()).toBe(2);
  });

  it('keeps the newer local copy and does not duplicate ledger lines', async () => {
    await db.people.add(treasurer);
    await createBudget({ name: 'VBS', purpose: '', assigneeName: 'Kids', amount: 5000, startDate: '2026-10-01' }, treasurer);
    const old = await snapshot();
    const b = (await db.budgets.toArray())[0];
    await new Promise((r) => setTimeout(r, 5));
    await db.budgets.update(b.id, { amount: 9000 });
    expect(await mergeSnapshot(old)).toEqual({ added: 0, updated: 0 });
    expect((await db.budgets.get(b.id))?.amount).toBe(9000);
    expect(await db.ledger.count()).toBe(1);
  });
});
