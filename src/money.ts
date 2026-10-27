// All amounts are stored as whole cents so totals never drift.
export type Cents = number;

const fmt = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });

export function formatMoney(cents: Cents): string {
  return fmt.format(cents / 100);
}

/** Parses "1,234.50", "$12", "12.5" into cents. Returns null when it isn't a number. */
export function parseMoney(input: string): Cents | null {
  const cleaned = input.replace(/[^0-9.,-]/g, '').replace(/,(?=\d{3}(\D|$))/g, '').replace(',', '.');
  if (!cleaned || isNaN(Number(cleaned))) return null;
  return Math.round(Number(cleaned) * 100);
}

export function toInput(cents: Cents): string {
  return (cents / 100).toFixed(2);
}
