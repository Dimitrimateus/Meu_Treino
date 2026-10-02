import { useEffect, useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMe } from '../auth/AuthProvider';
import { db } from '../../lib/db';
import { groupBySession, prefillFor, useCatalog, useExerciseHistory, useSessionOn, type PastSession } from '../../lib/data/queries';
import { deleteSet, ensureSessionExercise, restoreSet, saveSet, setExerciseCompleted } from '../../lib/data/actions';
import { setLabel, targetLabel } from '../../lib/data/format';
import { dateForWeekday, formatDateShort, formatRest, localDate } from '../../lib/dates';
import { formatKg } from '../../lib/numbers';
import { personalRecords } from '../../lib/pr';
import { exerciseMediaUrl } from '../../lib/supabase';
import { useWakeLock, vibrate } from '../../lib/useWakeLock';
import type { SessionExercise, SetLog } from '../../lib/types';
import { BackLink } from '../../components/BackLink';
import { PrBadge, TypeBadge } from '../../components/Badge';
import { Spinner } from '../../components/Empty';
import { Icon } from '../../components/Icon';
import { NumberInput } from '../../components/NumberInput';
import { useToast } from '../../components/Toast';

interface Draft { reps: number | null; weight: number | null }

export default function ExercisePage() {
  const { weekday: wdParam, id } = useParams();
  const weekday = Number(wdParam);
  const { userId, tz } = useMe();
  const toast = useToast();
  const catalog = useCatalog();
  const date = dateForWeekday(weekday, tz);
  const today = localDate(new Date(), tz);
  const view = useSessionOn(userId, date);
  const routineEx = useLiveQuery(() => db.routineExercises.get(id!), [id]);

  const se: SessionExercise | undefined = view?.exercises.find((x) => x.id === id || x.routine_exercise_id === id);
  const re = routineEx ?? undefined;
  const exerciseId = se?.exercise_id ?? re?.exercise_id;
  const history = useExerciseHistory(userId, exerciseId);
  const [past, setPast] = useState<PastSession[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [extraRows, setExtraRows] = useState(0);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const sets = useMemo(() => (se && view ? view.sets.filter((s) => s.session_exercise_id === se.id) : []), [se, view]);
  useEffect(() => { if (history) void groupBySession(history, view?.session.id).then(setPast); }, [history, view?.session.id]);

  const isToday = date === today, isPast = date < today;
  const canLog = isToday || (isPast && !!view && view.session.status !== 'skipped');
  useWakeLock(isToday && view?.session.status === 'in_progress');

  if (!catalog || view === undefined || routineEx === undefined || !history) return <Spinner />;
  if (!se && !re) return <Navigate to={`/dia/${weekday}`} replace />;

  const ex = exerciseId ? catalog.exercises.get(exerciseId) : undefined;
  const name = se?.exercise_name_snapshot ?? ex?.name ?? 'Exercício';
  const target = se ?? re!;
  const targetSets = target.target_sets ?? 3;
  const maxSaved = sets.reduce((m, s) => Math.max(m, s.set_number), 0);
  const rowCount = Math.max(targetSets, maxSaved) + extraRows;
  const last = past[0];
  const media = exerciseId ? catalog.media.get(exerciseId) ?? [] : [];
  const records = personalRecords(history);
  const done = Boolean(se?.completed_at);
  const suggestComplete = !done && sets.length >= targetSets && targetSets > 0;

  const valueFor = (n: number): Draft => {
    if (drafts[n]) return drafts[n];
    const saved = sets.find((s) => s.set_number === n);
    if (saved) return { reps: saved.reps, weight: Number(saved.weight_kg) };
    const p = prefillFor(n, last, { reps: target.target_reps, weight: target.target_weight_kg === null ? null : Number(target.target_weight_kg) });
    return { reps: p.reps, weight: p.weight };
  };

  async function getSe(): Promise<SessionExercise | null> {
    if (se) return se;
    if (!re || !isToday) return null;
    return ensureSessionExercise(userId, date, re.id);
  }

  async function save(n: number) {
    const v = valueFor(n);
    if (v.reps === null) { toast.show('Informe as repetições'); return; }
    const target = await getSe();
    if (!target) return;
    const saved = sets.find((s) => s.set_number === n);
    const row = await saveSet({ se: target, setNumber: n, reps: v.reps, weightKg: v.weight ?? 0, id: saved?.id });
    setDrafts((d) => { const c = { ...d }; delete c[n]; return c; });
    if (row.is_pr) { vibrate([30, 50, 30]); toast.show('Novo recorde pessoal! 🏆'); } else vibrate(15);
  }

  async function remove(s: SetLog) {
    await deleteSet(s.id);
    toast.show(`Série ${s.set_number} removida`, { action: { label: 'Desfazer', run: () => void restoreSet(s) } });
  }

  function copyFrom(p: PastSession) {
    const next: Record<number, Draft> = {};
    p.sets.forEach((s) => {
      if (!sets.some((x) => x.set_number === s.set_number)) next[s.set_number] = { reps: s.reps, weight: Number(s.weight_kg) };
    });
    setDrafts((d) => ({ ...d, ...next }));
    if (p.sets.length > rowCount) setExtraRows((x) => x + p.sets.length - rowCount);
    toast.show(`Cargas de ${formatDateShort(p.date)} copiadas`);
  }

  async function toggleDone() {
    const t = await getSe();
    if (!t) return;
    await setExerciseCompleted(t.id, !done);
    if (!done) vibrate(20);
  }

  return (
    <>
      <BackLink to={`/dia/${weekday}`} label="Dia" />
      {/* 1. Cabeçalho */}
      <h1 className="mb0">{name}</h1>
      <div className="row wrap" style={{ gap: 6, margin: '6px 0 12px' }}>
        <TypeBadge type={ex?.type_id ? catalog.types.get(ex.type_id) : null} />
        <span className="muted small">{targetLabel(target)}</span>
      </div>
      {target.rest_seconds ? <p className="small row"><Icon name="clock" size={16} /> Descanso sugerido: {formatRest(target.rest_seconds)}</p> : null}
      {re?.notes && <p className="banner small">{re.notes}</p>}

      {/* 2. Como fazer */}
      {(ex?.description || media.length > 0) && (
        <>
          <h2 className="section-title">Como fazer</h2>
          {ex?.description && <p style={{ whiteSpace: 'pre-line' }}>{ex.description}</p>}
          {media.length > 0 && (
            <div className="gallery">
              {media.map((m, i) => (
                <button key={m.id} onClick={() => setLightbox(exerciseMediaUrl(m.storage_path))} aria-label={`Ampliar imagem ${i + 1}`}>
                  <img src={exerciseMediaUrl(m.storage_path)} alt={`${name}, imagem ${i + 1}`} loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* 3. Registro de hoje */}
      <h2 className="section-title">{isToday ? 'Registro de hoje' : `Registro de ${formatDateShort(date)}`}</h2>
      {!canLog ? (
        <p className="muted">{date > today ? 'Você poderá registrar no dia do treino.' : 'Sem registro neste dia.'}</p>
      ) : (
        <div className="card">
          <div className="set-row set-head" aria-hidden>
            <span>Série</span><span>Reps</span><span>Kg</span><span />
          </div>
          {Array.from({ length: rowCount }, (_, i) => i + 1).map((n) => {
            const saved = sets.find((s) => s.set_number === n);
            const v = valueFor(n);
            const changed = saved && drafts[n] && (drafts[n].reps !== saved.reps || drafts[n].weight !== Number(saved.weight_kg));
            return (
              <div key={n} className={`set-row ${saved ? 'saved' : ''}`}>
                <span className="set-n">{n}{saved?.is_pr && <PrBadge compact kinds={saved.pr_kinds} />}</span>
                <NumberInput label={`Repetições da série ${n}`} value={v.reps} onChange={(reps) => setDrafts((d) => ({ ...d, [n]: { ...valueFor(n), reps } }))} onEnter={() => void save(n)} />
                <NumberInput decimal label={`Carga da série ${n} em kg`} value={v.weight} onChange={(weight) => setDrafts((d) => ({ ...d, [n]: { ...valueFor(n), weight } }))} onEnter={() => void save(n)} />
                <div className="row" style={{ gap: 4 }}>
                  <button className={`check-btn sm ${saved && !changed ? 'on' : ''}`} onClick={() => void save(n)}
                    aria-label={saved ? (changed ? `Atualizar série ${n}` : `Série ${n} salva`) : `Salvar série ${n}`}>
                    <Icon name={changed ? 'refresh' : 'check'} />
                  </button>
                  {saved && <button className="btn ghost icon-btn" onClick={() => void remove(saved)} aria-label={`Remover série ${n}`}><Icon name="trash" size={18} /></button>}
                </div>
              </div>
            );
          })}
          <button className="btn secondary block mt" onClick={() => setExtraRows((x) => x + 1)}><Icon name="plus" /> Série</button>
          {suggestComplete && (
            <div className="banner mt row between">
              <span>Meta de séries atingida.</span>
              <button className="btn sm" onClick={() => void toggleDone()}>Concluir exercício</button>
            </div>
          )}
        </div>
      )}

      {/* 4. Últimos registros */}
      <h2 className="section-title">Últimos registros</h2>
      {past.length === 0 ? <p className="muted small">Nenhum registro anterior deste exercício.</p> : (
        <div className="card">
          <ul className="list">
            {past.slice(0, 3).map((p) => (
              <li key={p.sessionId}>
                <button className="btn ghost block past-row" onClick={() => canLog && copyFrom(p)} disabled={!canLog}
                  aria-label={`Copiar cargas de ${formatDateShort(p.date)} para hoje`}>
                  <span className="muted small">{formatDateShort(p.date)}</span>
                  <span className="grow small" style={{ textAlign: 'left' }}>{p.sets.map(setLabel).join(' · ')}</span>
                  {canLog && <Icon name="copy" size={18} />}
                </button>
              </li>
            ))}
          </ul>
          {canLog && <p className="muted tiny mb0">Toque numa linha para copiar as cargas.</p>}
        </div>
      )}

      {/* 5. Recordes */}
      <h2 className="section-title">Seus recordes</h2>
      <div className="stats">
        <div className="card stat"><strong>{formatKg(records.maxWeight?.value)}</strong><span>maior carga{records.maxWeight && ` · ${formatDateShort(records.maxWeight.date.slice(0, 10))}`}</span></div>
        <div className="card stat"><strong>{records.bestE1rm ? formatKg(Math.round(records.bestE1rm.value * 10) / 10) : '—'}</strong><span>1RM estimado{records.bestE1rm && ` · ${formatDateShort(records.bestE1rm.date.slice(0, 10))}`}</span></div>
        <div className="card stat"><strong>{records.bestSetVolume ? formatKg(records.bestSetVolume.value) : '—'}</strong><span>melhor volume numa série</span></div>
        {records.maxReps && <div className="card stat"><strong>{records.maxReps.value}</strong><span>máx. reps sem carga</span></div>}
      </div>

      {/* 6. Concluir */}
      {canLog && (
        <button className={`btn block lg mt ${done ? 'secondary' : ''}`} onClick={() => void toggleDone()} aria-pressed={done}>
          <Icon name="check" /> {done ? 'Concluído — desmarcar' : 'Concluir exercício'}
        </button>
      )}

      {lightbox && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label="Imagem ampliada" onClick={() => setLightbox(null)}>
          <button className="btn ghost icon-btn close" aria-label="Fechar" onClick={() => setLightbox(null)}><Icon name="close" /></button>
          <img src={lightbox} alt={name} />
        </div>
      )}
    </>
  );
}
