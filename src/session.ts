import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Person, type Role } from './db';

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  treasurer: 'Treasurer',
  leader: 'Ministry leader',
  missionary: 'Missionary',
  volunteer: 'Volunteer',
};

/** Admins and treasurers set budgets, approve expenses and pay people back. */
export const canManage = (p?: Person) => p?.role === 'admin' || p?.role === 'treasurer';

/** The person using this device. Settings keys starting with "device." are never backed up or restored. */
export function useMe(): Person | undefined {
  return useLiveQuery(async () => {
    const id = (await db.settings.get('device.meId'))?.value as string | undefined;
    return id ? db.people.get(id) : undefined;
  });
}

export function setMe(id: string) {
  return db.settings.put({ key: 'device.meId', value: id });
}

/**
 * After receiving a file from the treasurer, the person on this phone may appear twice: once as
 * the treasurer added them and once as they signed in here. Matching email or name joins the two,
 * keeping the treasurer's copy (and the role it was given).
 */
export async function linkSamePerson(me: Person): Promise<boolean> {
  const twin = await db.people
    .filter((p) => p.id !== me.id && ((!!me.email && p.email === me.email) || p.name.trim().toLowerCase() === me.name.trim().toLowerCase()))
    .first();
  if (!twin) return false;
  await db.transaction('rw', [db.people, db.expenses, db.budgets, db.settings], async () => {
    await db.expenses.where('spenderId').equals(me.id).modify({ spenderId: twin.id });
    await db.budgets.where('assigneeId').equals(me.id).modify({ assigneeId: twin.id });
    if (me.email && !twin.email) await db.people.update(twin.id, { email: me.email });
    await db.people.delete(me.id);
    await setMe(twin.id);
  });
  return true;
}
