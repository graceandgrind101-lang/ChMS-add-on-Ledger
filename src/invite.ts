import { db, getSetting, setSetting, type Person } from './db';
import { mergeSnapshot } from './backup';

/**
 * An invite is a link that carries everything a new person needs: who they are, the church,
 * who invited them, and the budgets assigned to them. There is no server, so the data rides in
 * the link itself (compressed), and opening it merges that data into the new phone.
 */
export interface Invite {
  v: 1;
  church: string;
  /** Missing in links made before churches could pick a currency. */
  currency?: string;
  personId: string;
  people: Person[];
  data: { budgets: unknown[]; expenses: unknown[]; ledger: unknown[]; closeouts: unknown[] };
}

const toBase64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

export async function encodeInvite(invite: Invite): Promise<string> {
  return toBase64Url(await pipe(new TextEncoder().encode(JSON.stringify(invite)), new CompressionStream('deflate-raw')));
}

export async function decodeInvite(code: string): Promise<Invite> {
  try {
    const invite = JSON.parse(new TextDecoder().decode(await pipe(fromBase64Url(code), new DecompressionStream('deflate-raw')))) as Invite;
    if (invite.v !== 1 || !invite.people.some((p) => p.id === invite.personId)) throw new Error();
    return invite;
  } catch {
    throw new Error('This invite link is damaged or incomplete. Ask for a new one.');
  }
}

/** Builds an invite for one person, with their budgets and what has happened in them so far. */
export async function buildInvite(person: Person, from: Person): Promise<Invite> {
  const budgets = await db.budgets.where('assigneeId').equals(person.id).toArray();
  const ids = budgets.map((b) => b.id);
  const inBudgets = <T extends { budgetId: string }>(rows: T[]) => rows.filter((r) => ids.includes(r.budgetId));
  return {
    v: 1,
    church: await getSetting('churchName', ''),
    currency: await getSetting('currency', 'USD'),
    personId: person.id,
    people: from.id === person.id ? [person] : [from, person],
    data: {
      budgets,
      expenses: inBudgets(await db.expenses.where('budgetId').anyOf(ids).toArray()),
      ledger: inBudgets(await db.ledger.where('budgetId').anyOf(ids).toArray()),
      closeouts: inBudgets(await db.closeouts.where('budgetId').anyOf(ids).toArray()),
    },
  };
}

export async function inviteLink(person: Person, from: Person) {
  const base = new URL(import.meta.env.BASE_URL, window.location.href).href;
  return `${base}#/join?i=${await encodeInvite(await buildInvite(person, from))}`;
}

/** Adds the invite's people and budgets to this phone. Returns the invited person. */
export async function acceptInvite(invite: Invite): Promise<Person> {
  await mergeSnapshot({
    app: 'chms-ledger',
    version: 1,
    exportedAt: '',
    data: { people: invite.people, ...invite.data, receipts: [] },
  });
  if (invite.church && !(await getSetting('churchName', ''))) await setSetting('churchName', invite.church);
  if (invite.currency) await setSetting('currency', invite.currency);
  return (await db.people.get(invite.personId))!;
}
