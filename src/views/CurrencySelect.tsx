import { useLiveQuery } from 'dexie-react-hooks';
import { getSetting, setSetting } from '../db';
import { CURRENCIES } from '../money';

/**
 * The church's currency. Changing it relabels amounts; it does not convert them. Without
 * value/onChange it saves straight away; with them the parent saves (e.g. on a form's Save).
 */
export default function CurrencySelect({ id = 'currency', value, onChange }: { id?: string; value?: string; onChange?: (code: string) => void }) {
  const saved = useLiveQuery(() => getSetting('currency', 'USD'), [], 'USD');
  return (
    <>
      <label htmlFor={id}>Currency</label>
      <select id={id} value={value ?? saved} onChange={(e) => (onChange ? onChange(e.target.value) : setSetting('currency', e.target.value))}>
        {Object.entries(CURRENCIES).map(([code, name]) => <option key={code} value={code}>{code} · {name}</option>)}
      </select>
    </>
  );
}
