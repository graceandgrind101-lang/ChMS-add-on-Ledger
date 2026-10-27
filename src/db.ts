import Dexie, { type Table } from 'dexie';
import type { Cents } from './money';

export type Role = 'admin' | 'treasurer' | 'leader' | 'missionary' | 'volunteer';

export interface Person {
  id: string;
  name: string;
  email?: string;
  role: Role;
  updatedAt?: number;
}

export interface Budget {
  id: string;
  name: string;
  purpose: string;
  /** The person or group the church gave this budget to. */
  assigneeId?: string;
  assigneeName: string;
  amount: Cents;
  startDate: string; // YYYY-MM-DD
  endDate?: string; // budget expires after this day
  status: 'active' | 'closed';
  cycle: number;
  /** The budget this one renewed, when it was reset. */
  previousId?: string;
  createdAt: number;
  updatedAt?: number;
}

export type ExpenseStatus = 'pending' | 'approved' | 'rejected';

export interface Expense {
  id: string;
  budgetId: string;
  date: string;
  merchant: string;
  category: string;
  amount: Cents;
  notes: string;
  /** 'own' means the person paid out of pocket and must be paid back. */
  paidWith: 'budget' | 'own';
  spenderId?: string;
  spenderName: string;
  status: ExpenseStatus;
  reimbursement: 'none' | 'owed' | 'paid';
  receiptId?: string;
  ocrText?: string;
  source: 'camera' | 'gallery' | 'email' | 'manual';
  decidedBy?: string;
  decidedAt?: number;
  rejectReason?: string;
  createdAt: number;
  updatedAt?: number;
}

export interface Receipt {
  id: string;
  blob: Blob;
}

export type LedgerKind = 'allocation' | 'expense' | 'reimbursement' | 'return' | 'top-up';

/** One line in the ledger. Money in raises the budget balance, money out lowers it. */
export interface LedgerEntry {
  id: string;
  seq?: number;
  date: string;
  budgetId: string;
  kind: LedgerKind;
  description: string;
  moneyIn: Cents;
  moneyOut: Cents;
  /** Reimbursements are memo lines: the budget was already charged when the expense was approved. */
  memoAmount?: Cents;
  expenseId?: string;
  by: string;
  createdAt: number;
}

export interface CloseOut {
  id: string;
  budgetId: string;
  assigneeId?: string;
  assigneeName: string;
  closedAt: number;
  allocated: Cents;
  spent: Cents;
  saved: Cents; // negative when over budget
  savedPct: number;
  points: number;
  badge: string;
  note: string;
}

export interface Setting {
  key: string;
  value: unknown;
}

class LedgerDB extends Dexie {
  people!: Table<Person, string>;
  budgets!: Table<Budget, string>;
  expenses!: Table<Expense, string>;
  receipts!: Table<Receipt, string>;
  ledger!: Table<LedgerEntry, number>;
  closeouts!: Table<CloseOut, string>;
  settings!: Table<Setting, string>;

  constructor() {
    super('chms-ledger');
    this.version(1).stores({
      people: 'id, name',
      budgets: 'id, status, assigneeId, createdAt',
      expenses: 'id, budgetId, status, reimbursement, spenderId, createdAt',
      receipts: 'id',
      ledger: '++seq, id, budgetId, kind, createdAt',
      closeouts: 'id, budgetId, assigneeId, closedAt',
      settings: 'key',
    });
    // Stamp every change so updates shared between phones can be merged newest-wins.
    for (const table of [this.people, this.budgets, this.expenses] as Table<{ updatedAt?: number }, string>[]) {
      table.hook('creating', (_key, obj) => {
        obj.updatedAt ??= Date.now();
      });
      table.hook('updating', (mods) => ('updatedAt' in mods ? undefined : { updatedAt: Date.now() }));
    }
  }
}

export const db = new LedgerDB();

export const uid = () => crypto.randomUUID();
// en-CA formats as YYYY-MM-DD in the device's own time zone.
export const today = () => new Date().toLocaleDateString('en-CA');

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row ? (row.value as T) : fallback;
}

export function setSetting(key: string, value: unknown) {
  return db.settings.put({ key, value });
}
