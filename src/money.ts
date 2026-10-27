// All amounts are stored as whole cents so totals never drift.
export type Cents = number;

/** Currencies a church can pick. Each church uses one, set by its treasurer. */
export const CURRENCIES: Record<string, string> = {
  USD: 'US dollar', CAD: 'Canadian dollar', GBP: 'British pound', EUR: 'Euro', AUD: 'Australian dollar',
  KES: 'Kenyan shilling', NGN: 'Nigerian naira', GHS: 'Ghanaian cedi', ZAR: 'South African rand',
  UGX: 'Ugandan shilling', TZS: 'Tanzanian shilling', RWF: 'Rwandan franc', ETB: 'Ethiopian birr',
  INR: 'Indian rupee', PHP: 'Philippine peso', BRL: 'Brazilian real', MXN: 'Mexican peso',
};

let code = 'USD';
let fmt = new Intl.NumberFormat(undefined, { style: 'currency', currency: code });

/** Switches every amount shown in the app to the church's currency. */
export function setCurrency(next: string) {
  if (next === code || !CURRENCIES[next]) return;
  code = next;
  fmt = new Intl.NumberFormat(undefined, { style: 'currency', currency: code });
}

export const currencyCode = () => code;

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
