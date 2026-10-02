import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db';
import { useSyncStatus } from '../lib/sync/status';

export function useOutboxCounts() {
  return useLiveQuery(async () => {
    const all = await db.outbox.toArray();
    return { pending: all.filter((i) => i.status === 'pending').length, failed: all.filter((i) => i.status === 'failed').length };
  }, [], { pending: 0, failed: 0 });
}

/** ✓ Sincronizado / ↻ Sincronizando / ⏳ N pendentes / ⚠ Offline */
export function SyncStatus() {
  const s = useSyncStatus();
  const { pending, failed } = useOutboxCounts();
  const nav = useNavigate();
  let text = '✓ Sincronizado', cls = '';
  if (!s.online) { text = pending ? `⚠ Offline · ${pending}` : '⚠ Offline'; cls = 'warn'; }
  else if (failed) { text = `⚠ ${failed} com erro`; cls = 'err'; }
  else if (s.syncing) text = '↻ Sincronizando';
  else if (pending) { text = `⏳ ${pending} pendente${pending > 1 ? 's' : ''}`; cls = 'warn'; }
  else if (s.lastError) { text = '⚠ Erro ao sincronizar'; cls = 'warn'; }
  return (
    <button className={`sync-pill ${cls}`} onClick={() => nav('/perfil#sync')} aria-label={`Sincronização: ${text}. Ver detalhes`}>
      {text}
    </button>
  );
}
