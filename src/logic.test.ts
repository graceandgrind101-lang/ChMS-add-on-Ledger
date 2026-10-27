import { describe, expect, it } from 'vitest';
import { budgetAlerts, parseReceiptText, reminders, scoreCloseOut, spendByCategory, summarize } from './logic';
import type { Budget, Expense } from './db';

const budget: Budget = {
  id: 'b1', name: 'Kenya trip', purpose: '', assigneeName: 'Ruth', amount: 200000,
  startDate: '2026-10-01', endDate: '2026-10-31', status: 'active', cycle: 1, createdAt: 0,
};
const exp = (amount: number, status: Expense['status']): Expense => ({
  id: String(Math.random()), budgetId: 'b1', date: '2026-10-05', merchant: 'x', category: 'Travel', amount, notes: '',
  paidWith: 'budget', spenderName: 'Ruth', status, reimbursement: 'none', source: 'manual', createdAt: 0,
});

describe('summarize', () => {
  it('counts approved and pending, ignores rejected', () => {
    const s = summarize(budget, [exp(50000, 'approved'), exp(10000, 'pending'), exp(99900, 'rejected')], '2026-10-16');
    expect(s.approved).toBe(50000);
    expect(s.pending).toBe(10000);
    expect(s.left).toBe(140000);
    expect(s.timePct).toBe(0.5);
    expect(s.daysLeft).toBe(15);
  });
});

describe('budgetAlerts', () => {
  it('warns when low and expiring', () => {
    const s = summarize(budget, [exp(170000, 'approved')], '2026-10-28');
    const texts = budgetAlerts(s, 'active').map((a) => a.text);
    expect(texts).toContain('Running low: 20% or less left');
    expect(texts).toContain('Expires in 3 days');
  });
  it('praises saving pace', () => {
    const s = summarize(budget, [exp(20000, 'approved')], '2026-10-20');
    expect(budgetAlerts(s, 'active')).toEqual([{ tone: 'good', text: 'On track to save' }]);
  });
  it('flags overspending', () => {
    const s = summarize(budget, [exp(210000, 'approved')], '2026-10-10');
    expect(budgetAlerts(s, 'active')[0]).toEqual({ tone: 'critical', text: 'Over budget' });
  });
});

describe('scoreCloseOut', () => {
  it('rewards savers', () => {
    expect(scoreCloseOut(200000, 140000)).toMatchObject({ saved: 60000, badge: 'Wise saver', points: 40 });
    expect(scoreCloseOut(200000, 175000).badge).toBe('Faithful steward');
    expect(scoreCloseOut(200000, 210000)).toMatchObject({ points: 0, badge: 'Over budget' });
  });
});

describe('parseReceiptText', () => {
  it('reads a store receipt', () => {
    const r = parseReceiptText(`WALMART SUPERCENTER\n10/14/2026 13:22\nWATER 24PK 4.98\nSUBTOTAL 52.10\nTAX 3.65\nTOTAL 55.75\nVISA TEND 55.75`);
    expect(r).toEqual({ merchant: 'WALMART SUPERCENTER', date: '2026-10-14', total: 5575 });
  });
  it('reads an emailed receipt', () => {
    const r = parseReceiptText(`From: receipts@delta.com\nSubject: Your receipt\nDelta Air Lines\nIssued Oct 3, 2026\nFare $1,180.00\nTaxes $92.40\nTotal paid: $1,272.40`);
    expect(r.merchant).toBe('Delta Air Lines');
    expect(r.date).toBe('2026-10-03');
    expect(r.total).toBe(127240);
  });
});

describe('spendByCategory', () => {
  it('totals approved spending per category, biggest first', () => {
    const food = { ...exp(3000, 'approved'), category: 'Food' };
    const rows = spendByCategory([exp(50000, 'approved'), food, { ...food, id: 'f2' }, exp(9999, 'pending')]);
    expect(rows).toEqual([{ category: 'Travel', total: 50000 }, { category: 'Food', total: 6000 }]);
  });
});

describe('reminders', () => {
  it('tells the treasurer what needs attention, most urgent first', () => {
    const ended = { ...budget, id: 'b2', name: 'VBS', assigneeName: 'Daniel', endDate: '2026-10-10' };
    const closed = { ...budget, id: 'b3', status: 'closed' as const, endDate: '2026-09-01' };
    const r = reminders([budget, ended, closed], [exp(10000, 'pending')], '2026-10-27', true);
    expect(r.map((x) => x.text)).toEqual([
      "Daniel's VBS ended 17 days ago. Review the report and close it.",
      "Ruth's Kenya trip ends in 4 days.",
      "Ruth's Kenya trip has 1 expense waiting for your approval.",
    ]);
  });
  it('asks the budget holder for receipts', () => {
    const r = reminders([budget], [], '2026-10-31', false);
    expect(r).toEqual([{ budgetId: 'b1', tone: 'warning', text: 'Kenya trip ends today. Add your receipts today.' }]);
  });
});
