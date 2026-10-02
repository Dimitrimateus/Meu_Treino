import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMe } from '../auth/AuthProvider';
import { useSessionDetail } from '../../lib/data/personData';
import { reopenSession } from '../../lib/data/actions';
import { setLabel, volumeOf } from '../../lib/data/format';
import { formatDateLong, formatDuration, formatTime, isoWeekday, localDate, weekDates } from '../../lib/dates';
import { formatVolume } from '../../lib/numbers';
import type { SessionEventKind } from '../../lib/types';
import { PrBadge } from '../../components/Badge';
import { Empty, Spinner } from '../../components/Empty';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toast';

const EVENT_LABEL: Record<SessionEventKind, string> = {
  session_started: 'Início (primeiro registro)',
  set_logged: 'Série registrada',
  exercise_completed: 'Exercício concluído',
  exercise_uncompleted: 'Exercício desmarcado',
  session_finished: 'Treino finalizado',
  session_reopened: 'Treino reaberto',
  session_skipped: 'Marcado “não treinei”',
};

export default function SessionSummaryPage() {
  const { id } = useParams();
  const { userId, tz } = useMe();
  const nav = useNavigate();
  const toast = useToast();
  const { data, error } = useSessionDetail(id!);
  const [showLog, setShowLog] = useState(false);
  const [onlyMain, setOnlyMain] = useState(true);

  if (error) return <p className="error-text">{error}</p>;
  if (data === undefined) return <Spinner />;
  if (data === null) return <Empty icon="calendar" title="Treino não encontrado" />;
  const { session: s, exercises, sets, events } = data;
  const own = s.user_id === userId;
  const completed = exercises.filter((e) => e.completed_at);
  const prs = sets.filter((x) => x.is_pr);
  const volume = volumeOf(sets);
  const exName = (seId: string | null) => exercises.find((e) => e.id === seId)?.exercise_name_snapshot;
  const timeline = [...events].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
    .filter((e) => !onlyMain || e.kind !== 'set_logged');

  return (
    <>
      <button className="btn ghost sm" style={{ marginLeft: -12, marginBottom: 8 }} onClick={() => nav(-1)}><Icon name="left" size={18} />Voltar</button>
      <h1 className="mb0">{s.title_snapshot || 'Treino'}</h1>
      <p className="muted cap">{formatDateLong(s.session_date)}</p>
      {s.status === 'skipped' ? (
        <div className="card soft"><strong>Não treinou</strong>{s.skip_reason && <> — {s.skip_reason}</>}</div>
      ) : (
        <>
          <div className="stats">
            <div className="card stat"><strong>{s.status === 'finished' ? formatDuration(s.duration_seconds) : '—'}</strong><span>duração{s.status !== 'finished' && ' (incompleto)'}</span></div>
            <div className="card stat"><strong>{formatTime(s.started_at, tz)}–{formatTime(s.finished_at, tz)}</strong><span>início e fim</span></div>
            <div className="card stat"><strong>{completed.length}/{exercises.length}</strong><span>exercícios concluídos</span></div>
            <div className="card stat"><strong>{formatVolume(volume)} kg</strong><span>volume total</span></div>
          </div>

          {prs.length > 0 && (
            <>
              <h2 className="section-title">Recordes do treino</h2>
              <div className="card">
                <ul className="list">
                  {prs.map((p) => (
                    <li key={p.id} className="row between"><span>{exName(p.session_exercise_id)} — {setLabel(p)}</span><PrBadge kinds={p.pr_kinds} /></li>
                  ))}
                </ul>
              </div>
            </>
          )}

          <h2 className="section-title">Exercícios</h2>
          {exercises.map((e) => {
            const list = sets.filter((x) => x.session_exercise_id === e.id).sort((a, b) => a.set_number - b.set_number);
            return (
              <div className="card" key={e.id}>
                <div className="row between">
                  <strong>{e.exercise_name_snapshot}</strong>
                  {e.completed_at && <span className="badge success"><Icon name="check" size={14} />{formatTime(e.completed_at, tz)}</span>}
                </div>
                {list.length === 0 ? <p className="muted small mb0">Sem séries registradas.</p> : (
                  <p className="small mb0">{list.map((x) => setLabel(x)).join(' · ')}</p>
                )}
              </div>
            );
          })}

          <button className="btn secondary block" onClick={() => setShowLog((v) => !v)} aria-expanded={showLog}>
            <Icon name="clock" /> {showLog ? 'Ocultar log' : 'Ver log'}
          </button>
          {showLog && (
            <div className="card mt">
              <label className="checkbox small"><input type="checkbox" checked={!onlyMain} onChange={(e) => setOnlyMain(!e.target.checked)} />Mostrar cada série</label>
              <ol className="timeline">
                {timeline.map((ev) => (
                  <li key={ev.id}>
                    <time>{formatTime(ev.occurred_at, tz)}</time>
                    <span>{EVENT_LABEL[ev.kind]}{ev.session_exercise_id && exName(ev.session_exercise_id) ? ` — ${exName(ev.session_exercise_id)}` : ''}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {own && s.status === 'finished' && (
            <button className="btn ghost block mt" onClick={async () => { await reopenSession(s.id); toast.show('Treino reaberto'); if (weekDates(localDate(new Date(), tz)).includes(s.session_date)) nav(`/dia/${isoWeekday(s.session_date)}`); }}>
              Reabrir treino
            </button>
          )}
        </>
      )}
    </>
  );
}
