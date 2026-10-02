import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMe } from '../auth/AuthProvider';
import { db } from '../../lib/db';
import { useCatalog, useRoutine, useSessionOn } from '../../lib/data/queries';
import { streaksFor } from '../../lib/data/streaks';
import { WEEKDAYS, WEEKDAYS_SHORT, formatClock, formatDateLong, formatDuration, isoWeekday, localDate, weekDates } from '../../lib/dates';
import { Icon } from '../../components/Icon';
import { Spinner } from '../../components/Empty';
import { RoutineChangedBanner } from '../session/RoutineChangedBanner';
import { InstallBanner } from '../profile/InstallGuide';

function useToday(tz: string) {
  const [today, setToday] = useState(() => localDate(new Date(), tz));
  useEffect(() => {
    const t = setInterval(() => setToday(localDate(new Date(), tz)), 60_000);
    return () => clearInterval(t);
  }, [tz]);
  return today;
}

export default function WeekPage() {
  const { userId, tz, profile } = useMe();
  const today = useToday(tz);
  const week = weekDates(today);
  const todayWd = isoWeekday(today);
  const routine = useRoutine(userId);
  const catalog = useCatalog();
  const sessions = useLiveQuery(() => db.workoutSessions.where('user_id').equals(userId).toArray(), [userId]);
  const todayView = useSessionOn(userId, today);

  if (!routine || !sessions) return <Spinner />;
  const live = sessions.filter((s) => !s.deleted_at);
  const byDate = new Map(live.map((s) => [s.session_date, s]));
  const { current } = streaksFor(routine.days, live, today);
  const doneThisWeek = week.filter((d) => byDate.get(d)?.status === 'finished').length;
  const plannedThisWeek = routine.days.filter((d) => !d.is_rest).length;
  const todayDay = routine.days.find((d) => d.weekday === todayWd);
  const todayExercises = todayDay ? routine.exercisesByDay.get(todayDay.id) ?? [] : [];
  const todaySession = todayView?.session;
  const total = todayView ? todayView.exercises.length : todayExercises.length;
  const completed = todayView ? todayView.exercises.filter((e) => e.completed_at).length : 0;

  return (
    <>
      <InstallBanner />
      {todaySession?.status === 'in_progress' && <RoutineChangedBanner sessionId={todaySession.id} />}
      <div className="row between" style={{ marginBottom: 12 }}>
        <div>
          <h1 className="mb0">Olá, {profile?.name?.split(' ')[0] ?? ''}</h1>
          <div className="muted small cap">{formatDateLong(today)}</div>
        </div>
      </div>

      <div className="week-strip" role="list" aria-label="Semana">
        {routine.days.map((d) => {
          const date = week[d.weekday - 1];
          const s = byDate.get(date);
          const mark = s?.status === 'finished' ? 'done' : s?.status === 'skipped' ? 'skipped' : s?.status === 'in_progress' ? 'progress' : '';
          return (
            <Link role="listitem" key={d.weekday} to={`/dia/${d.weekday}`}
              className={`week-day ${d.weekday === todayWd ? 'today' : ''} ${d.is_rest ? 'rest' : ''} ${mark}`}
              aria-label={`${WEEKDAYS[d.weekday - 1]}: ${d.is_rest ? 'Descanso' : d.title || 'Treino'}${mark === 'done' ? ', concluído' : mark === 'skipped' ? ', não treinou' : ''}`}>
              <span className="wd">{WEEKDAYS_SHORT[d.weekday - 1]}</span>
              <span className="dn">{date.slice(8)}</span>
              <span className="mk" aria-hidden>{mark === 'done' ? <Icon name="check" size={16} /> : mark === 'skipped' ? '–' : mark === 'progress' ? '•' : ''}</span>
              <span className="tt ellipsis">{d.is_rest ? 'Descanso' : d.title || 'Treino'}</span>
            </Link>
          );
        })}
      </div>

      <section className="card" aria-labelledby="hoje">
        <h2 id="hoje" className="section-title" style={{ marginTop: 0 }}>Treino de hoje</h2>
        {!todayDay || todayDay.is_rest ? (
          <div className="row"><Icon name="rest" /><div><strong>Hoje é descanso</strong><div className="muted small">Recupere bem!</div></div></div>
        ) : todaySession?.status === 'finished' ? (
          <>
            <div className="row"><span className="badge success"><Icon name="check" size={14} />Concluído</span><strong>{todayDay.title || 'Treino'}</strong></div>
            <p className="muted small mt">Duração: {formatDuration(todaySession.duration_seconds)}</p>
            <Link className="btn secondary block" to={`/sessao/${todaySession.id}`}>Ver resumo</Link>
          </>
        ) : todaySession?.status === 'skipped' ? (
          <>
            <strong>{todayDay.title || 'Treino'}</strong>
            <p className="muted small">Você marcou “Não treinei hoje”{todaySession.skip_reason ? `: ${todaySession.skip_reason}` : ''}.</p>
            <Link className="btn secondary block" to={`/dia/${todayWd}`}>Abrir o dia</Link>
          </>
        ) : (
          <>
            <div className="row between">
              <strong className="grow">{todayDay.title || 'Treino'}</strong>
              {todayDay.scheduled_time && <span className="muted small row"><Icon name="clock" size={16} />{formatClock(todayDay.scheduled_time)}</span>}
            </div>
            <div className="progress mt" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={completed} aria-label="Exercícios concluídos">
              <div style={{ width: total ? `${(completed / total) * 100}%` : 0 }} />
            </div>
            <p className="muted small">{completed}/{total} exercícios</p>
            <Link className="btn block lg" to={`/dia/${todayWd}`}>{todaySession ? 'Continuar' : 'Começar'}</Link>
            {catalog && todayExercises.length > 0 && !todaySession && (
              <p className="muted small mt mb0">{todayExercises.map((e) => catalog.exercises.get(e.exercise_id)?.name).filter(Boolean).join(' · ')}</p>
            )}
          </>
        )}
      </section>

      <div className="stats">
        <div className="card stat"><strong className="row"><Icon name="flame" />{current}</strong><span>sequência</span></div>
        <div className="card stat"><strong>{doneThisWeek}/{plannedThisWeek}</strong><span>treinos nesta semana</span></div>
      </div>
    </>
  );
}
