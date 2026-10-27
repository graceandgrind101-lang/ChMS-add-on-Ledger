import { describe, expect, it } from 'vitest';
import { budgetEndEvent } from './calendar';
import type { Budget } from './db';

const budget: Budget = {
  id: 'b1', name: 'Kenya trip, phase 1', purpose: '', assigneeName: 'Ruth', amount: 100000,
  startDate: '2026-10-01', endDate: '2026-10-31', status: 'active', cycle: 1, createdAt: 0,
};

describe('budgetEndEvent', () => {
  it('makes an all-day event on the end date with two alerts', () => {
    const ics = budgetEndEvent(budget, true, new Date('2026-10-27T10:00:00Z'));
    expect(ics).toContain('DTSTART;VALUE=DATE:20261031\r\n');
    expect(ics).toContain('DTEND;VALUE=DATE:20261101\r\n');
    expect(ics).toContain('SUMMARY:Budget ends: Kenya trip\\, phase 1 (Ruth)\r\n');
    expect(ics).toContain('DTSTAMP:20261027T100000Z');
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(2);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});
