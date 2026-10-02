// Motor de sincronização: push (outbox) + pull incremental.
// Gatilhos: abrir o app, voltar ao primeiro plano, evento "online", após cada
// mutação, a cada ~60 s e Realtime nas tabelas do treino. (iOS não tem Background Sync.)
import { db } from '../db';
import { supabase } from '../supabase';
import type { Profile } from '../types';
import { resolveSessionConflict } from './conflict';
import { processOutbox, resetBackoff } from './outbox';
import { PULL_TABLES, pullTable } from './pull';
import { supabaseRemote, type Remote } from './remote';
import { getSyncStatus, setSyncStatus } from './status';
import { startRealtime, stopRealtime } from './realtime';

let userId: string | null = null;
let remote: Remote = supabaseRemote;
let running: Promise<void> | null = null;
let rerun = false;
let timer: ReturnType<typeof setInterval> | null = null;
let debounce: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

export function setRemote(r: Remote) { remote = r; }

async function pullProfile(uid: string) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
  if (error) throw error;
  if (data) await db.profile.put(data as Profile);
}

async function runOnce(opts: { pull: boolean }) {
  if (!userId) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    setSyncStatus({ online: false });
    return;
  }
  setSyncStatus({ syncing: true, online: true });
  try {
    // push primeiro (dados locais da pessoa), repetindo se um conflito reescreveu a fila
    for (let i = 0; i < 5; i++) {
      const r = await processOutbox({ remote, onSessionConflict: (item) => resolveSessionConflict(item, remote) });
      if (!r.again) {
        if (r.retryLater) scheduleRetry();
        break;
      }
    }
    if (opts.pull) {
      await pullProfile(userId);
      for (const spec of PULL_TABLES) await pullTable(spec, userId, remote);
    }
    setSyncStatus({ syncing: false, lastSyncAt: Date.now(), lastError: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : (e as { message?: string })?.message ?? String(e);
    setSyncStatus({ syncing: false, lastError: msg });
  }
}

function scheduleRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  db.outbox.orderBy('seq').first().then((first) => {
    if (!first || first.status !== 'pending') return;
    const wait = Math.max(1000, first.nextAttemptAt - Date.now());
    retryTimer = setTimeout(() => void syncNow({ pull: false }), wait);
  });
}

/** Sincroniza agora (uma execução por vez; pedidos durante a execução viram 1 nova rodada). */
export function syncNow(opts: { pull?: boolean } = {}): Promise<void> {
  const pull = opts.pull ?? true;
  if (running) { rerun = true; return running; }
  running = (async () => {
    do {
      rerun = false;
      await runOnce({ pull });
    } while (rerun);
  })().finally(() => { running = null; });
  return running;
}

/** Chamado após cada mutação local. */
export function requestSync() {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => void syncNow({ pull: false }), 400);
}

const onOnline = () => { setSyncStatus({ online: true }); void resetBackoff().then(() => syncNow()); };
const onOffline = () => setSyncStatus({ online: false });
const onVisible = () => { if (document.visibilityState === 'visible') void syncNow(); };

export function startSync(uid: string) {
  if (userId === uid) return;
  stopSync();
  userId = uid;
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  document.addEventListener('visibilitychange', onVisible);
  timer = setInterval(() => { if (document.visibilityState === 'visible') void syncNow(); }, 60_000);
  startRealtime(uid, () => void syncNow());
  void syncNow();
}

export function stopSync() {
  userId = null;
  window.removeEventListener('online', onOnline);
  window.removeEventListener('offline', onOffline);
  document.removeEventListener('visibilitychange', onVisible);
  if (timer) clearInterval(timer);
  if (debounce) clearTimeout(debounce);
  if (retryTimer) clearTimeout(retryTimer);
  timer = debounce = retryTimer = null;
  stopRealtime();
}

export function isSyncing() { return getSyncStatus().syncing; }
