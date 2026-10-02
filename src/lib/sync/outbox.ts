// Fila de saída (outbox): toda mutação local de dados da pessoa é gravada no Dexie
// e enfileirada aqui; o envio é em ordem (seq), idempotente (upsert por id).
import { db, localTable } from '../db';
import type { OutboxItem, PushTable } from '../types';
import type { Remote, RemoteError, Row } from './remote';

/** Backoff exponencial para erros de rede/5xx: 2s, 5s, 15s, 60s, 5min… */
export const BACKOFF_MS = [2_000, 5_000, 15_000, 60_000, 300_000];
export function backoffDelay(tries: number): number {
  return BACKOFF_MS[Math.min(Math.max(tries - 1, 0), BACKOFF_MS.length - 1)];
}

export type ErrorClass = 'retry' | 'fail' | 'conflict';

/** Rede/5xx/timeout/401 → tentar de novo; 23505 → conflito; outros 4xx → falha. */
export function classifyError(e: RemoteError): ErrorClass {
  if (e.code === '23505') return 'conflict';
  const s = e.status ?? 0;
  if (s === 0 || s >= 500 || s === 408 || s === 429 || s === 401) return 'retry';
  if (s >= 400) return 'fail';
  return 'retry';
}

/** Remove campos só-locais (prefixo "_") antes de enviar. */
export function toRemoteRow(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) if (!k.startsWith('_')) out[k] = v;
  delete out.created_at;
  delete out.updated_at; // sempre hora do servidor (trigger)
  return out;
}

/** Enfileira uma mutação. Deve ser chamado dentro da mesma transação que grava o Dexie. */
export async function enqueue(table: PushTable, row: Row, op: 'upsert' | 'delete' = 'upsert') {
  const item: OutboxItem = {
    table, op, row_id: String(row.id), row: toRemoteRow(row), tries: 0, status: 'pending',
    lastError: null, nextAttemptAt: 0, createdAt: Date.now(),
  };
  await db.outbox.add(item);
}

export interface ProcessDeps {
  remote: Remote;
  now?: () => number;
  /** resolve conflito de sessão duplicada (23505); devolve true se reatribuiu e deve reenviar */
  onSessionConflict?: (item: OutboxItem) => Promise<boolean>;
}

export interface ProcessResult { sent: number; failed: number; retryLater: boolean; again: boolean }

/** Linha a enviar: a versão mais recente do Dexie, ou o snapshot do item. */
async function currentRow(item: OutboxItem): Promise<Row> {
  const local = await localTable(item.table).get(item.row_id);
  const base = local ? toRemoteRow(local) : item.row;
  if (item.op === 'delete' && !base.deleted_at) return { ...base, deleted_at: item.row.deleted_at ?? new Date().toISOString() };
  return base;
}

/** Envia fotos pendentes ao Storage antes da linha (foto sobe, depois grava a linha). */
async function prepareItem(item: OutboxItem, remote: Remote): Promise<RemoteError | null> {
  if (item.table !== 'progress_photos') return null;
  const path = String(item.row.storage_path);
  if (item.op === 'delete') {
    const r = await remote.removePhoto(path);
    // arquivo já inexistente não é erro
    return r.error && classifyError(r.error) === 'retry' ? r.error : null;
  }
  const local = await db.progressPhotos.get(item.row_id);
  if (local && local._blob && !local._uploaded) {
    const r = await remote.uploadPhoto(path, local._blob);
    if (r.error) return r.error;
    await db.progressPhotos.update(item.row_id, { _uploaded: true });
  }
  return null;
}

/**
 * Processa a fila em ordem. Itens consecutivos da mesma tabela vão num único upsert.
 * Para no primeiro erro de rede (mantém a ordem); erro 4xx marca o item como "falha".
 */
export async function processOutbox(deps: ProcessDeps): Promise<ProcessResult> {
  const now = deps.now ?? Date.now;
  const result: ProcessResult = { sent: 0, failed: 0, retryLater: false, again: false };
  const pending = (await db.outbox.orderBy('seq').toArray()).filter((i) => i.status === 'pending');
  if (pending.length === 0) return result;
  if (pending[0].nextAttemptAt > now()) { result.retryLater = true; return result; }

  let i = 0;
  while (i < pending.length) {
    // monta lote: mesma tabela, consecutivos, sem fotos (essas vão uma a uma)
    const batch: OutboxItem[] = [pending[i]];
    if (pending[i].table !== 'progress_photos') {
      while (i + batch.length < pending.length && pending[i + batch.length].table === pending[i].table && batch.length < 200) {
        batch.push(pending[i + batch.length]);
      }
    }
    i += batch.length;

    const outcome = await sendBatch(batch, deps, now);
    result.sent += outcome.sent;
    result.failed += outcome.failed;
    if (outcome.again) { result.again = true; break; }
    if (outcome.stop) { result.retryLater = true; break; }
  }
  return result;
}

type Outcome = { sent: number; failed: number; stop: boolean; again?: boolean };

async function sendBatch(batch: OutboxItem[], deps: ProcessDeps, now: () => number): Promise<Outcome> {
  const prepErr = await prepareItem(batch[0], deps.remote);
  if (prepErr) return handleError(batch, prepErr, deps, now);

  // dedupe por id (fica a versão mais recente)
  const rows = new Map<string, Row>();
  for (const it of batch) rows.set(it.row_id, await currentRow(it));
  const { error } = await deps.remote.upsert(batch[0].table, [...rows.values()]);
  if (!error) {
    await db.outbox.bulkDelete(batch.map((b) => b.seq!));
    return { sent: batch.length, failed: 0, stop: false };
  }
  // lote com erro de validação: tenta um a um para isolar o item ruim
  if (batch.length > 1 && classifyError(error) !== 'retry') {
    let sent = 0, failed = 0;
    for (const it of batch) {
      const r = await sendBatch([it], deps, now);
      sent += r.sent; failed += r.failed;
      if (r.stop) return { sent, failed, stop: true, again: r.again };
    }
    return { sent, failed, stop: false };
  }
  return handleError(batch, error, deps, now);
}

async function handleError(batch: OutboxItem[], error: RemoteError, deps: ProcessDeps, now: () => number): Promise<Outcome> {
  const cls = classifyError(error);
  const item = batch[0];
  if (cls === 'conflict' && item.table === 'workout_sessions' && deps.onSessionConflict) {
    const resolved = await deps.onSessionConflict(item);
    if (resolved) return { sent: 0, failed: 0, stop: true, again: true }; // fila mudou: recomeça
  }
  if (cls === 'retry') {
    for (const it of batch) {
      const tries = it.tries + 1;
      await db.outbox.update(it.seq!, { tries, lastError: error.message, nextAttemptAt: now() + backoffDelay(tries) });
    }
    return { sent: 0, failed: 0, stop: true };
  }
  for (const it of batch) {
    await db.outbox.update(it.seq!, { status: 'failed', tries: it.tries + 1, lastError: `${error.code ? error.code + ': ' : ''}${error.message}` });
  }
  return { sent: 0, failed: batch.length, stop: false };
}

/** Perfil → Sincronização: "Tentar de novo". */
export async function retryFailed(seq?: number) {
  const items = seq ? [await db.outbox.get(seq)] : await db.outbox.where('status').equals('failed').toArray();
  for (const it of items) if (it) await db.outbox.update(it.seq!, { status: 'pending', nextAttemptAt: 0 });
}

/** Perfil → Sincronização: "Descartar". */
export async function discardFailed(seq: number) {
  await db.outbox.delete(seq);
}

/** Zera o backoff (ex.: evento "online"). */
export async function resetBackoff() {
  await db.outbox.where('status').equals('pending').modify({ nextAttemptAt: 0 });
}
