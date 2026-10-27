import type { Budget } from './db';

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
const day = (date: string) => date.replace(/-/g, '');

function nextDay(date: string) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * A calendar event on the day a budget ends, with alerts 3 days and 1 day before. Phones turn
 * these into real notifications, which a server-less app cannot send by itself.
 */
export function budgetEndEvent(budget: Budget, manager: boolean, now = new Date()): string {
  if (!budget.endDate) throw new Error('This budget has no end date.');
  const summary = manager ? `Budget ends: ${budget.name} (${budget.assigneeName})` : `Budget ends: ${budget.name}`;
  const todo = manager ? 'Review the report and close the budget in ChMS Ledger.' : 'Add your last receipts in ChMS Ledger so the budget can be closed.';
  const alarm = (trigger: string, text: string) => ['BEGIN:VALARM', `TRIGGER:${trigger}`, 'ACTION:DISPLAY', `DESCRIPTION:${esc(text)}`, 'END:VALARM'];
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ChMS Ledger//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:budget-${budget.id}@chms-ledger`,
    `DTSTAMP:${now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
    `DTSTART;VALUE=DATE:${day(budget.endDate)}`,
    `DTEND;VALUE=DATE:${day(nextDay(budget.endDate))}`,
    `SUMMARY:${esc(summary)}`,
    `DESCRIPTION:${esc(todo)}`,
    ...alarm('-P3D', `${budget.name} ends in 3 days. ${todo}`),
    ...alarm('-P1D', `${budget.name} ends tomorrow. ${todo}`),
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n') + '\r\n';
}
