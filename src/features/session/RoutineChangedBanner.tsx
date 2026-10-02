import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { applyRoutineChanges, routineDiff } from '../../lib/data/actions';
import { db } from '../../lib/db';
import { useToast } from '../../components/Toast';

/** "O treino foi atualizado. Aplicar mudanças?" — sessão em andamento não muda sozinha. */
export function RoutineChangedBanner({ sessionId }: { sessionId: string }) {
  const toast = useToast();
  const diff = useLiveQuery(async () => {
    // reavalia quando treino ou sessão mudarem
    await db.routineExercises.count();
    await db.sessionExercises.where('session_id').equals(sessionId).count();
    return routineDiff(sessionId);
  }, [sessionId]);
  const key = diff ? `treinos-diff-${sessionId}-${diff.added.length}-${diff.removed.length}-${diff.changed.length}` : '';
  const [dismissed, setDismissed] = useState(() => (key ? sessionStorage.getItem(key) === '1' : false));
  if (!diff || dismissed || (key && sessionStorage.getItem(key) === '1')) return null;
  const parts = [
    diff.added.length && `${diff.added.length} novo(s)`,
    diff.removed.length && `${diff.removed.length} removido(s)`,
    diff.changed.length && `${diff.changed.length} alterado(s)`,
  ].filter(Boolean).join(', ');
  return (
    <div className="banner" role="alert">
      <strong>O treino foi atualizado.</strong> Aplicar mudanças? <span className="muted small">({parts})</span>
      <div className="row mt">
        <button className="btn sm" onClick={async () => { await applyRoutineChanges(sessionId); toast.show('Mudanças aplicadas'); }}>Aplicar</button>
        <button className="btn sm secondary" onClick={() => { sessionStorage.setItem(key, '1'); setDismissed(true); }}>Agora não</button>
      </div>
    </div>
  );
}
