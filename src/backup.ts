import { db, type CloseOut, type LedgerEntry } from './db';

const TABLES = ['people', 'budgets', 'expenses', 'ledger', 'closeouts', 'settings'] as const;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Everything on this device as one JSON document, receipt photos included. */
export async function exportSnapshot() {
  const data: Record<string, unknown[]> = {};
  for (const t of TABLES) data[t] = await db.table(t).toArray();
  data.settings = (data.settings as { key: string }[]).filter((s) => !s.key.startsWith('device.'));
  const receipts = await db.receipts.toArray();
  data.receipts = await Promise.all(receipts.map(async (r) => ({ id: r.id, dataUrl: await blobToDataUrl(r.blob) })));
  return { app: 'chms-ledger', version: 1, exportedAt: new Date().toISOString(), data };
}

export type Snapshot = Awaited<ReturnType<typeof exportSnapshot>>;

/** Replaces this device's data with a snapshot, e.g. when restoring on a new phone. */
export async function importSnapshot(snap: Snapshot) {
  if (snap.app !== 'chms-ledger') throw new Error('This file is not a ChMS Ledger backup.');
  const receipts = await Promise.all(
    (snap.data.receipts as { id: string; dataUrl: string }[]).map(async (r) => ({ id: r.id, blob: await (await fetch(r.dataUrl)).blob() })),
  );
  await db.transaction('rw', [...TABLES.map((t) => db.table(t)), db.receipts], async () => {
    for (const t of TABLES) {
      const keep = t === 'settings' ? await db.settings.filter((s) => s.key.startsWith('device.')).toArray() : [];
      await db.table(t).clear();
      await db.table(t).bulkAdd(snap.data[t] ?? []);
      if (keep.length) await db.settings.bulkPut(keep);
    }
    await db.receipts.clear();
    await db.receipts.bulkAdd(receipts);
  });
}

export interface MergeResult {
  added: number;
  updated: number;
}

/**
 * Brings in updates from another phone without losing anything here. Budgets, expenses and
 * people keep whichever copy changed last; ledger lines, close-outs and receipts are added
 * when missing (they are never edited after being written).
 */
export async function mergeSnapshot(snap: Snapshot): Promise<MergeResult> {
  if (snap.app !== 'chms-ledger') throw new Error('This file is not a ChMS Ledger file.');
  const result: MergeResult = { added: 0, updated: 0 };
  const receipts = await Promise.all(
    ((snap.data.receipts ?? []) as { id: string; dataUrl: string }[]).map(async (r) => ({ id: r.id, blob: await (await fetch(r.dataUrl)).blob() })),
  );

  await db.transaction('rw', [db.people, db.budgets, db.expenses, db.ledger, db.closeouts, db.receipts], async () => {
    for (const t of ['people', 'budgets', 'expenses'] as const) {
      for (const incoming of (snap.data[t] ?? []) as { id: string; updatedAt?: number }[]) {
        const table = db.table<{ id: string; updatedAt?: number }, string>(t);
        const existing = await table.get(incoming.id);
        if (!existing) {
          await table.add(incoming);
          result.added++;
        } else if ((incoming.updatedAt ?? 0) > (existing.updatedAt ?? 0)) {
          await table.put(incoming);
          result.updated++;
        }
      }
    }
    for (const entry of (snap.data.ledger ?? []) as LedgerEntry[]) {
      if (await db.ledger.where('id').equals(entry.id).count()) continue;
      const { seq: _seq, ...rest } = entry;
      await db.ledger.add(rest);
      result.added++;
    }
    for (const c of (snap.data.closeouts ?? []) as CloseOut[]) {
      if (!(await db.closeouts.get(c.id))) {
        await db.closeouts.add(c);
        result.added++;
      }
    }
    for (const r of receipts) {
      if (!(await db.receipts.get(r.id))) await db.receipts.add(r);
    }
  });
  return result;
}
