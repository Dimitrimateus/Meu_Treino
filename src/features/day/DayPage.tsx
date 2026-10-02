import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useMe } from '../auth/AuthProvider';
import { useCatalog, useRoutine, useSessionOn } from '../../lib/data/queries';
import { ensureSessionExercise, finishSession, reopenSession, setExerciseCompleted, skipDay, undoSkip } from '../../lib/data/actions';
import { targetLabel } from '../../lib/data/format';
import { WEEKDAYS, dateForWeekday, formatClock, formatDateLong, formatDuration, localDate } from '../../lib/dates';
import { useWakeLock, vibrate } from '../../lib/useWakeLock';
import { BackLink } from '../../components/BackLink';
import { TypeBadge } from '../../components/Badge';
import { Empty, Spinner } from '../../components/Empty';
import { Icon } from '../../components/Icon';
import { ConfirmDialog, Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { RoutineChangedBanner } from '../session/RoutineChangedBanner';

interface Row { key: string; linkId: string; routineExerciseId: string | null; seId: string | null; exerciseId: string; name: string; meta: string; done: boolean; setsDone: number; targetSets: number | null }

export default function DayPage() {
  const { weekday: wdParam } = useParams();
  const weekday = Number(wdParam);
  const { userId, tz } = useMe();
  const nav = useNavigate();
  const toast = useToast();
  const routine = useRoutine(userId);
  const catalog = useCatalog();
  const valid = weekday >= 1 && weekday <= 7;
  const date = valid ? dateForWeekday(weekday, tz) : '';
  const today = localDate(new Date(), tz);
  const view = useSessionOn(userId, date);
  const [skipOpen, setSkipOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [reason, setReason] = useState('');
  const isToday = date === today, isPast = date < today, isFuture = date > today;
  const inProgress = view?.session.status === 'in_progress';
  useWakeLock(Boolean(isToday && inProgress));

  if (!valid) return <Navigate to="/" replace />;
  if (!routine || !catalog || view === undefined) return <Spinner />;
  const day = routine.days.find((d) => d.weekday === weekday);
  const s = view?.session;

  const rows: Row[] = view && view.exercises.length
    ? view.exercises.map((se) => ({
        key: se.id, linkId: se.id, routineExerciseId: se.routine_exercise_id, seId: se.id, exerciseId: se.exercise_id,
        name: se.exercise_name_snapshot, meta: targetLabel(se), done: Boolean(se.completed_at),
        setsDone: view.sets.filter((x) => x.session_exercise_id === se.id).length, targetSets: se.target_sets,
      }))
    : (day && !day.is_rest && !(isPast && !s) ? routine.exercisesByDay.get(day.id) ?? [] : []).map((re) => ({
        key: re.id, linkId: re.id, routineExerciseId: re.id, seId: null, exerciseId: re.exercise_id,
        name: catalog.exercises.get(re.exercise_id)?.name ?? 'Exercício', meta: targetLabel(re), done: false, setsDone: 0, targetSets: re.target_sets,
      }));
  const canEdit = isToday || (isPast && !!s && s.status !== 'skipped');
  const completedCount = rows.filter((r) => r.done).length;

  async function toggle(r: Row) {
    if (!canEdit) return;
    let seId = r.seId;
    if (!seId && r.routineExerciseId) seId = (await ensureSessionExercise(userId, date, r.routineExerciseId))?.id ?? null;
    if (!seId) return;
    await setExerciseCompleted(seId, !r.done);
    if (!r.done) vibrate(15);
  }

  async function finish() {
    if (!s) return;
    await finishSession(s.id);
    setFinishOpen(false);
    vibrate([20, 40, 20]);
    nav(`/sessao/${s.id}`);
  }

  return (
    <div className={inProgress ? 'has-footer' : ''}>
      <BackLink to="/" label="Semana" />
      {s && inProgress && <RoutineChangedBanner sessionId={s.id} />}
      <h1 className="mb0">{WEEKDAYS[weekday - 1]}</h1>
      <p className="muted cap">
        {formatDateLong(date)}{isToday && ' · hoje'}
        {day && !day.is_rest && day.scheduled_time && <> · {formatClock(day.scheduled_time)}</>}
      </p>
      {(s?.title_snapshot || (day && !day.is_rest && day.title)) && <h2>{s?.title_snapshot || day?.title}</h2>}

      {s?.status === 'finished' && (
        <div className="card soft row between">
          <div><span className="badge success"><Icon name="check" size={14} />Concluído</span> <span className="small">Duração {formatDuration(s.duration_seconds)}</span></div>
          <Link className="btn sm secondary" to={`/sessao/${s.id}`}>Resumo</Link>
        </div>
      )}
      {s?.status === 'skipped' && (
        <div className="card soft">
          <strong>Não treinei</strong>{s.skip_reason && <span className="muted"> — {s.skip_reason}</span>}
          {(isToday || isPast) && <div className="mt"><button className="btn sm secondary" onClick={() => void undoSkip(s.id)}>Desfazer</button></div>}
        </div>
      )}

      {day?.is_rest && !s ? (
        <Empty icon="rest" title="Dia de descanso">Aproveite para recuperar.</Empty>
      ) : isPast && !s ? (
        <Empty icon="calendar" title="Nenhum registro neste dia" />
      ) : rows.length === 0 ? (
        <Empty icon="dumbbell" title="Nenhum exercício neste treino" />
      ) : (
        <ul className="ex-list" aria-label="Exercícios">
          {rows.map((r, i) => {
            const ex = catalog.exercises.get(r.exerciseId);
            return (
              <li key={r.key} className={`card ex-row ${r.done ? 'done' : ''}`}>
                <Link to={`/dia/${weekday}/ex/${r.linkId}`} className="grow ex-link">
                  <div className="row"><span className="muted small">{i + 1}.</span><strong className="ellipsis">{r.name}</strong></div>
                  <div className="row wrap" style={{ gap: 6 }}>
                    <TypeBadge type={ex?.type_id ? catalog.types.get(ex.type_id) : null} />
                    <span className="muted small">{r.meta}</span>
                  </div>
                  {r.setsDone > 0 && <div className="small" style={{ color: 'var(--primary)' }}>{r.setsDone}{r.targetSets ? `/${r.targetSets}` : ''} séries</div>}
                </Link>
                {!isFuture && s?.status !== 'skipped' && (
                  <button className={`check-btn ${r.done ? 'on' : ''}`} onClick={() => void toggle(r)} disabled={!canEdit}
                    aria-pressed={r.done} aria-label={`${r.done ? 'Desmarcar' : 'Marcar'} ${r.name} como concluído`}>
                    <Icon name="check" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {isToday && day && !day.is_rest && (!s || (s.status === 'in_progress' && view!.sets.length === 0)) && (
        <button className="btn ghost block mt" onClick={() => setSkipOpen(true)}>Não treinei hoje</button>
      )}
      {s?.status === 'finished' && (isToday || isPast) && (
        <button className="btn ghost block mt" onClick={async () => { await reopenSession(s.id); toast.show('Treino reaberto'); }}>Reabrir treino</button>
      )}

      {inProgress && (
        <div className="fixed-footer">
          <div className="inner row between">
            <span className="small muted">{completedCount}/{rows.length} concluídos</span>
            <button className="btn lg" onClick={() => (completedCount < rows.length ? setFinishOpen(true) : void finish())}>Finalizar treino</button>
          </div>
        </div>
      )}

      {skipOpen && (
        <Modal title="Não treinei hoje" onClose={() => setSkipOpen(false)} actions={<>
          <button className="btn secondary" onClick={() => setSkipOpen(false)}>Cancelar</button>
          <button className="btn" onClick={async () => { await skipDay(userId, date, reason.trim() || null); setSkipOpen(false); toast.show('Registrado'); }}>Confirmar</button>
        </>}>
          <label className="field"><span>Motivo (opcional)</span>
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: viagem, cansaço, dor…" />
          </label>
          <p className="muted small">Isso aparece no calendário e interrompe a sequência.</p>
        </Modal>
      )}
      {finishOpen && (
        <ConfirmDialog title="Finalizar mesmo assim?" confirmLabel="Finalizar" onCancel={() => setFinishOpen(false)} onConfirm={() => void finish()}
          message={<p>{rows.length - completedCount} exercício(s) ainda não foram concluídos.</p>} />
      )}
    </div>
  );
}
