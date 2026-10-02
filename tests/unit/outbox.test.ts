import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppDB, db, setDb } from '../../src/lib/db';
import { backoffDelay, classifyError, enqueue, processOutbox, retryFailed } from '../../src/lib/sync/outbox';
import { resolveSessionConflict } from '../../src/lib/sync/conflict';
import type { Remote, RemoteError, Row } from '../../src/lib/sync/remote';
import type { PushTable } from '../../src/lib/types';

let n = 0;
beforeEach(async () => {
  setDb(new AppDB(`test-${++n}`));
  await db.open();
});

/** Servidor falso: guarda linhas por tabela (upsert por id) e permite injetar erros. */
function fakeRemote(opts: { errors?: (RemoteError | null)[]; uniqueSessionDay?: boolean } = {}) {
  const tables: Record<string, Map<string, Row>> = {};
  const calls: { table: string; ids: string[] }[] = [];
  const errors = [...(opts.errors ?? [])];
  const remote: Remote = {
    async upsert(table: PushTable, rows: Row[]) {
      calls.push({ table, ids: rows.map((r) => String(r.id)) });
      const e = errors.shift();
      if (e) return { error: e };
      const t = (tables[table] ??= new Map());
      if (opts.uniqueSessionDay && table === 'workout_sessions') {
        for (const r of rows) {
          for (const ex of t.values()) {
            if (ex.id !== r.id && ex.user_id === r.user_id && ex.session_date === r.session_date) {
              return { error: { message: 'duplicate key', code: '23505', status: 409 } };
            }
          }
        }
      }
      for (const r of rows) t.set(String(r.id), { ...(t.get(String(r.id)) ?? {}), ...r });
      return { error: null };
    },
    async fetchChanged() { return { data: [], error: null }; },
    async findSessionByDate(userId, date) {
      const t = tables.workout_sessions ?? new Map();
      return { data: [...t.values()].find((r) => r.user_id === userId && r.session_date === date) ?? null, error: null };
    },
    async fetchSessionExercises(sessionId) {
      return { data: [...(tables.session_exercises?.values() ?? [])].filter((r) => r.session_id === sessionId), error: null };
    },
    async uploadPhoto() { return { error: null }; },
    async removePhoto() { return { error: null }; },
  };
  return { remote, tables, calls };
}

const U = 'user-1';

describe('classificação de erro e backoff', () => {
  it('classifica', () => {
    expect(classifyError({ message: 'Failed to fetch', status: 0 })).toBe('retry');
    expect(classifyError({ message: 'x', status: 503 })).toBe('retry');
    expect(classifyError({ message: 'rls', status: 403, code: '42501' })).toBe('fail');
    expect(classifyError({ message: 'check', status: 400, code: '23514' })).toBe('fail');
    expect(classifyError({ message: 'dup', status: 409, code: '23505' })).toBe('conflict');
  });
  it('backoff exponencial 2s, 5s, 15s, 60s…', () => {
    expect([1, 2, 3, 4, 5, 9].map(backoffDelay)).toEqual([2000, 5000, 15000, 60000, 300000, 300000]);
  });
});

describe('processOutbox', () => {
  it('envia em ordem e agrupa por tabela', async () => {
    const { remote, calls } = fakeRemote();
    await enqueue('workout_sessions', { id: 's1', user_id: U, session_date: '2026-10-01' });
    await enqueue('session_exercises', { id: 'e1', session_id: 's1' });
    await enqueue('set_logs', { id: 'l1', session_id: 's1' });
    await enqueue('set_logs', { id: 'l2', session_id: 's1' });
    const r = await processOutbox({ remote });
    expect(r.sent).toBe(4);
    expect(calls.map((c) => c.table)).toEqual(['workout_sessions', 'session_exercises', 'set_logs']);
    expect(calls[2].ids).toEqual(['l1', 'l2']);
    expect(await db.outbox.count()).toBe(0);
  });

  it('idempotente: o mesmo id enfileirado 2x vira 1 linha (última versão)', async () => {
    const { remote, tables, calls } = fakeRemote();
    await db.setLogs.put({ id: 'l1', reps: 12 } as never);
    await enqueue('set_logs', { id: 'l1', reps: 10 });
    await enqueue('set_logs', { id: 'l1', reps: 12 });
    await processOutbox({ remote });
    expect(calls[0].ids).toEqual(['l1']);
    expect(tables.set_logs.get('l1')!.reps).toBe(12);
    // reenviar não duplica
    await enqueue('set_logs', { id: 'l1', reps: 12 });
    await processOutbox({ remote });
    expect(tables.set_logs.size).toBe(1);
  });

  it('erro de rede: mantém na fila com backoff e para (preserva ordem)', async () => {
    const { remote, calls } = fakeRemote({ errors: [{ message: 'Failed to fetch', status: 0 }] });
    await enqueue('workout_sessions', { id: 's1' });
    await enqueue('set_logs', { id: 'l1' });
    const t0 = 1_000_000;
    const r = await processOutbox({ remote, now: () => t0 });
    expect(r.retryLater).toBe(true);
    expect(calls).toHaveLength(1);
    const items = await db.outbox.orderBy('seq').toArray();
    expect(items).toHaveLength(2);
    expect(items[0].tries).toBe(1);
    expect(items[0].nextAttemptAt).toBe(t0 + 2000);
    // antes do prazo não tenta
    const r2 = await processOutbox({ remote, now: () => t0 + 1000 });
    expect(r2.sent).toBe(0);
    expect(calls).toHaveLength(1);
    // depois do prazo envia tudo
    const r3 = await processOutbox({ remote, now: () => t0 + 2500 });
    expect(r3.sent).toBe(2);
  });

  it('erro 4xx vira "falha" e não bloqueia os demais', async () => {
    const { remote } = fakeRemote({ errors: [{ message: 'violates row-level security', status: 403, code: '42501' }] });
    await enqueue('body_weight_logs', { id: 'w1' });
    await enqueue('set_logs', { id: 'l1' });
    const r = await processOutbox({ remote });
    expect(r.failed).toBe(1);
    expect(r.sent).toBe(1);
    const failed = await db.outbox.where('status').equals('failed').toArray();
    expect(failed).toHaveLength(1);
    expect(failed[0].lastError).toContain('42501');
    // falhas não são reenviadas automaticamente…
    expect((await processOutbox({ remote })).sent).toBe(0);
    // …só com "Tentar de novo"
    await retryFailed();
    expect((await processOutbox({ remote })).sent).toBe(1);
  });

  it('lote com item inválido: isola o item ruim', async () => {
    const { remote, tables } = fakeRemote({ errors: [{ message: 'check', status: 400, code: '23514' }, null, { message: 'check', status: 400, code: '23514' }] });
    await enqueue('set_logs', { id: 'ok' });
    await enqueue('set_logs', { id: 'bad' });
    const r = await processOutbox({ remote });
    expect(r.sent).toBe(1);
    expect(r.failed).toBe(1);
    expect(tables.set_logs.has('ok')).toBe(true);
  });

  it('não envia campos só-locais nem updated_at', async () => {
    const { remote, tables } = fakeRemote();
    await enqueue('progress_photos', { id: 'p1', storage_path: 'u/p1.jpg', _blob: 'x', updated_at: 'y' });
    await processOutbox({ remote });
    const row = tables.progress_photos.get('p1')!;
    expect(row._blob).toBeUndefined();
    expect(row.updated_at).toBeUndefined();
  });
});

describe('conflito de sessão duplicada (23505)', () => {
  it('reatribui filhos à sessão existente e reenvia', async () => {
    const { remote, tables } = fakeRemote({ uniqueSessionDay: true });
    // outro aparelho já criou a sessão do dia, com o exercício "re1"
    tables.workout_sessions = new Map([['srv', { id: 'srv', user_id: U, session_date: '2026-10-01', status: 'in_progress', started_at: '2026-10-01T18:10:00Z' }]]);
    tables.session_exercises = new Map([['srv-se', { id: 'srv-se', session_id: 'srv', routine_exercise_id: 're1', exercise_id: 'ex1' }]]);

    const loc = { id: 'loc', user_id: U, session_date: '2026-10-01', status: 'in_progress', started_at: '2026-10-01T18:00:00Z' };
    const se1 = { id: 'loc-se1', session_id: 'loc', user_id: U, routine_exercise_id: 're1', exercise_id: 'ex1' };
    const se2 = { id: 'loc-se2', session_id: 'loc', user_id: U, routine_exercise_id: 're2', exercise_id: 'ex2' };
    const set1 = { id: 'set1', session_id: 'loc', session_exercise_id: 'loc-se1', user_id: U };
    const ev1 = { id: 'ev1', session_id: 'loc', session_exercise_id: null, kind: 'session_started', user_id: U };
    await db.workoutSessions.put(loc as never);
    await db.sessionExercises.bulkPut([se1, se2] as never);
    await db.setLogs.put(set1 as never);
    await db.sessionEvents.put(ev1 as never);
    await enqueue('workout_sessions', loc);
    await enqueue('session_exercises', se1);
    await enqueue('session_exercises', se2);
    await enqueue('set_logs', set1);
    await enqueue('session_events', ev1);

    let r = await processOutbox({ remote, onSessionConflict: (it) => resolveSessionConflict(it, remote) });
    expect(r.again).toBe(true);
    r = await processOutbox({ remote, onSessionConflict: (it) => resolveSessionConflict(it, remote) });
    expect(await db.outbox.count()).toBe(0);

    // local: só a sessão do servidor, com o menor started_at
    expect(await db.workoutSessions.get('loc')).toBeUndefined();
    expect((await db.workoutSessions.get('srv'))!.started_at).toBe('2026-10-01T18:00:00Z');
    // série foi para o exercício que já existia no servidor
    expect((await db.setLogs.get('set1'))!.session_id).toBe('srv');
    expect((await db.setLogs.get('set1'))!.session_exercise_id).toBe('srv-se');
    expect((await db.sessionEvents.get('ev1'))!.session_id).toBe('srv');
    // servidor: 1 sessão, exercício novo reatribuído, sem duplicar o existente
    expect(tables.workout_sessions.size).toBe(1);
    expect(tables.session_exercises.get('loc-se2')!.session_id).toBe('srv');
    expect(tables.session_exercises.has('loc-se1')).toBe(false);
    expect(tables.set_logs.get('set1')!.session_exercise_id).toBe('srv-se');
  });
});
