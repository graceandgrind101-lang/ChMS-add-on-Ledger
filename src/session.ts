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
