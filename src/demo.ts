import { db, getSetting, setSetting, uid, type Person } from './db';
import { loadSampleData } from './sample';
import { setMe } from './session';

/** Demo mode is a fresh device filled with example data, signed in as the church treasurer. */
export async function startDemo() {
  const me: Person = { id: uid(), name: 'Sam Taylor', role: 'treasurer' };
  await db.people.add(me);
  await setMe(me.id);
  await loadSampleData(me);
  await setSetting('churchName', 'Grace Community Church');
  await setSetting('device.demo', true);
  await setSetting('device.tourStep', 0);
  location.hash = '#/';
}

export const isDemo = () => getSetting('device.demo', false);

/** Leaving the demo wipes the example data so the device starts clean. */
export async function exitDemo() {
  await db.delete();
  location.hash = '';
  location.reload();
}

/** The bundled sample receipt, so the camera step can be shown without a real receipt. */
export async function sampleReceipt(): Promise<File> {
  const res = await fetch(`${import.meta.env.BASE_URL}demo-receipt.jpg`);
  return new File([await res.blob()], 'demo-receipt.jpg', { type: 'image/jpeg' });
}
