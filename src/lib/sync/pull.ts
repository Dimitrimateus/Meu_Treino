// Pull incremental: select * where updated_at >= cursor − 1s order by updated_at.
// Upsert local idempotente; linhas com deleted_at são removidas localmente.
import { db, localTable } from '../db';
import type { SyncedTable } from '../types';
import type { Remote, Row } from './remote';

export interface PullSpec { table: SyncedTable; own: boolean }

/** Ordem do pull. `own` = filtra pelo usuário logado (admin não baixa dados de outros). */
export const PULL_TABLES: PullSpec[] = [
  { table: 'exercise_types', own: false },
  { table: 'exercises', own: false },
  { table: 'exercise_media', own: false },
  { table: 'routine_days', own: true },
  { table: 'routine_exercises', own: true },
  { table: 'workout_sessions', own: true },
  { table: 'session_exercises', own: true },
  { table: 'set_logs', own: true },
  { table: 'session_events', own: true },
  { table: 'body_weight_logs', own: true },
  { table: 'progress_photos', own: true },
];

const PAGE = 1000;
const OVERLAP_MS = 1000;

export function cursorWithOverlap(cursor: string | null): string | null {
  if (!cursor) return null;
  return new Date(new Date(cursor).getTime() - OVERLAP_MS).toISOString();
}

export async function pullTable(spec: PullSpec, userId: string, remote: Remote): Promise<number> {
  const state = await db.syncState.get(spec.table);
  let cursor = state?.cursor ?? null;
  let total = 0;
  for (let page = 0; page < 50; page++) {
    const { data, error } = await remote.fetchChanged(spec.table, cursorWithOverlap(cursor), spec.own ? userId : null, PAGE);
    if (error) throw error;
    const rows = data ?? [];
    if (rows.length === 0) break;
    await applyRows(spec.table, rows);
    const last = String(rows[rows.length - 1].updated_at);
    total += rows.length;
    const advanced = last !== cursor;
    cursor = last;
    await db.syncState.put({ table: spec.table, cursor, lastSyncAt: Date.now() });
    if (rows.length < PAGE || !advanced) break;
  }
  return total;
}

/** Aplica linhas do servidor, sem sobrescrever o que ainda está pendente na fila. */
export async function applyRows(table: SyncedTable, rows: Row[]) {
  const t = localTable(table);
  await db.transaction('rw', [t, db.outbox], async () => {
    const pendingIds = new Set(
      (await db.outbox.where('row_id').anyOf(rows.map((r) => String(r.id))).toArray()).map((o) => o.row_id),
    );
    const toPut: Row[] = [];
    const toDelete: string[] = [];
    for (const r of rows) {
      const id = String(r.id);
      if (pendingIds.has(id)) continue;
      if (r.deleted_at) toDelete.push(id);
      else toPut.push(normalize(table, r));
    }
    if (toDelete.length) await t.bulkDelete(toDelete);
    if (toPut.length) {
      if (table === 'progress_photos') {
        // preserva o blob local (se houver)
        for (const r of toPut) {
          const cur = await t.get(String(r.id));
          await t.put(cur ? { ...r, _blob: cur._blob, _uploaded: true } : { ...r, _uploaded: true });
        }
      } else {
        await t.bulkPut(toPut);
      }
    }
  });
}

/** numeric chega como string do PostgREST em alguns casos; normaliza para number. */
function normalize(table: SyncedTable, r: Row): Row {
  const out = { ...r };
  for (const k of ['weight_kg', 'target_weight_kg']) {
    if (typeof out[k] === 'string') out[k] = Number(out[k]);
  }
  if (table === 'set_logs' && !Array.isArray(out.pr_kinds)) out.pr_kinds = [];
  return out;
}
