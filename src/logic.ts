import type { Budget, Expense } from './db';
import type { Cents } from './money';

export interface BudgetSummary {
  allocated: Cents;
  approved: Cents;
  pending: Cents;
  /** What is left if every pending expense is approved. */
  left: Cents;
  usedPct: number; // 0..1+, approved + pending
  timePct: number | null; // share of the budget period already gone
  daysLeft: number | null;
}

const DAY = 86_400_000;

function dayNumber(date: string) {
  return Math.floor(Date.parse(date + 'T00:00:00Z') / DAY);
}

export function summarize(budget: Budget, expenses: Expense[], onDate: string): BudgetSummary {
  let approved = 0;
  let pending = 0;
  for (const e of expenses) {
    if (e.budgetId !== budget.id) continue;
    if (e.status === 'approved') approved += e.amount;
    else if (e.status === 'pending') pending += e.amount;
  }
  const left = budget.amount - approved - pending;
  let timePct: number | null = null;
  let daysLeft: number | null = null;
  if (budget.endDate) {
    const start = dayNumber(budget.startDate);
    const end = dayNumber(budget.endDate);
    const now = dayNumber(onDate);
    daysLeft = end - now;
    timePct = end <= start ? 1 : Math.min(1, Math.max(0, (now - start) / (end - start)));
  }
  return {
    allocated: budget.amount,
    approved,
    pending,
    left,
    usedPct: budget.amount > 0 ? (approved + pending) / budget.amount : 0,
    timePct,
    daysLeft,
  };
}

export type Tone = 'good' | 'warning' | 'critical' | 'info';

export interface Alert {
  tone: Tone;
  text: string;
}

/** Warnings when a budget runs low or expires, and praise when someone is saving. */
export function budgetAlerts(s: BudgetSummary, status: Budget['status']): Alert[] {
  if (status === 'closed') return [];
  const alerts: Alert[] = [];
  if (s.left < 0) alerts.push({ tone: 'critical', text: 'Over budget' });
  else if (s.allocated > 0 && s.left <= s.allocated * 0.2) alerts.push({ tone: 'warning', text: 'Running low: 20% or less left' });

  if (s.daysLeft !== null) {
    if (s.daysLeft < 0) alerts.push({ tone: 'critical', text: 'Expired: report and close out' });
    else if (s.daysLeft <= 7) alerts.push({ tone: 'warning', text: `Expires in ${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'}` });
  }
  if (s.timePct !== null && s.left >= 0) {
    if (s.usedPct > s.timePct + 0.15 && s.usedPct < 1) alerts.push({ tone: 'warning', text: 'Spending faster than planned' });
    else if (s.timePct >= 0.5 && s.usedPct <= s.timePct - 0.15) alerts.push({ tone: 'good', text: 'On track to save' });
  }
  return alerts;
}

export interface CloseOutResult {
  saved: Cents;
  savedPct: number;
  points: number;
  badge: string;
  note: string;
}

/** Scores a finished budget. Saving church money earns points; going over earns none. */
export function scoreCloseOut(allocated: Cents, spent: Cents): CloseOutResult {
  const saved = allocated - spent;
  const savedPct = allocated > 0 ? saved / allocated : 0;
  if (saved < 0) {
    return { saved, savedPct, points: 0, badge: 'Over budget', note: 'Spent more than was given. Review with the treasurer.' };
  }
  const points = 10 + Math.round(savedPct * 100);
  if (savedPct >= 0.25) return { saved, savedPct, points, badge: 'Wise saver', note: 'Returned a quarter or more of the budget.' };
  if (savedPct >= 0.1) return { saved, savedPct, points, badge: 'Faithful steward', note: 'Returned 10% or more of the budget.' };
  return { saved, savedPct, points, badge: 'Used as planned', note: 'Stayed within the budget.' };
}

export interface ParsedReceipt {
  merchant?: string;
  date?: string;
  total?: Cents;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function findDate(text: string): string | undefined {
  let m = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = text.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    if (+m[1] <= 12) return `${year}-${pad(+m[1])}-${pad(+m[2])}`;
  }
  m = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(20\d{2})\b/i);
  if (m) return `${m[3]}-${pad(MONTHS.indexOf(m[1].toLowerCase()) + 1)}-${pad(+m[2])}`;
  return undefined;
}

const AMOUNT = /(?:\$\s*)?(\d{1,3}(?:,\d{3})*|\d+)[.,](\d{2})\b/g;

function amountsIn(line: string): Cents[] {
  return [...line.matchAll(AMOUNT)].map((m) => Number(m[1].replace(/,/g, '')) * 100 + Number(m[2]));
}

/** Pulls merchant, date and total out of OCR or pasted email text. Best effort; the user confirms. */
export function parseReceiptText(text: string): ParsedReceipt {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const result: ParsedReceipt = {};

  const merchant = lines.find((l) => /[a-z]{3}/i.test(l) && !/(receipt|invoice|order|subject|from:|to:|date)/i.test(l) && amountsIn(l).length === 0);
  if (merchant) result.merchant = merchant.replace(/[^\w&'.\- ]/g, '').trim().slice(0, 60);

  result.date = findDate(text);

  const totalLines = lines.filter((l) => /\b(grand\s+total|total|amount\s+due|balance\s+due|amount\s+paid)\b/i.test(l) && !/sub\s*-?\s*total/i.test(l));
  const totals = totalLines.flatMap(amountsIn);
  const all = lines.flatMap(amountsIn);
  if (totals.length) result.total = Math.max(...totals);
  else if (all.length) result.total = Math.max(...all);
  return result;
}
