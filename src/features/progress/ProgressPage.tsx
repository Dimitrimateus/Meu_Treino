import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ChartConfiguration } from 'chart.js';
import { useAuth } from '../auth/AuthProvider';
import { useViewedPerson } from '../../lib/people';
import { usePersonData } from '../../lib/data/personData';
import { useCatalog } from '../../lib/data/queries';
import { streaksFor } from '../../lib/data/streaks';
import { setLabel } from '../../lib/data/format';
import { DEFAULT_TZ, formatDateShort, formatDuration, localDate } from '../../lib/dates';
import { formatNumber } from '../../lib/numbers';
import { byType, durations, exercisesWithData, loadSeries, periodStart, sessionVolumes, weeklyFrequency, type Period, type Point } from '../../lib/progress';
import { Chart, SERIES } from '../../components/Chart';
import { Calendar } from '../../components/Calendar';
import { PersonPicker } from '../../components/PersonPicker';
import { PrBadge } from '../../components/Badge';
import { Empty, Spinner } from '../../components/Empty';
import { Icon } from '../../components/Icon';

const PERIODS: { id: Period; label: string }[] = [
  { id: '30', label: '30 dias' }, { id: '90', label: '90 dias' }, { id: '365', label: '1 ano' }, { id: 'all', label: 'Tudo' },
];

const line = (label: string, pts: Point[], color: string, extra?: { label: string; pts: Point[]; color: string }): ChartConfiguration => ({
  type: 'line',
  data: {
    labels: pts.map((p) => formatDateShort(p.date)),
    datasets: [
      { label, data: pts.map((p) => p.value), borderColor: color, backgroundColor: color, pointRadius: 3, tension: 0.2 },
      ...(extra ? [{ label: extra.label, data: extra.pts.map((p) => p.value), borderColor: extra.color, backgroundColor: extra.color, pointRadius: 3, tension: 0.2 }] : []),
    ],
  },
  options: { scales: { y: { beginAtZero: false } } },
});

const bar = (label: string, labels: string[], values: number[], color: string | string[], horizontal = false): ChartConfiguration => ({
  type: 'bar',
  data: { labels, datasets: [{ label, data: values, backgroundColor: color, borderRadius: 4 }] },
  options: { indexAxis: horizontal ? 'y' : 'x', scales: { [horizontal ? 'x' : 'y']: { beginAtZero: true, ticks: { precision: 0 } } } },
});

export default function ProgressPage() {
  const { tz: myTz } = useAuth();
  const { viewedId, isSelf, viewed } = useViewedPerson();
  const tz = viewed?.timezone || myTz || DEFAULT_TZ;
  const { data, error } = usePersonData(viewedId, isSelf);
  const catalog = useCatalog();
  const nav = useNavigate();
  const [period, setPeriod] = useState<Period>('90');
  const [exerciseId, setExerciseId] = useState<string>('');
  const [volScope, setVolScope] = useState<'session' | 'exercise'>('session');
  const [typeMetric, setTypeMetric] = useState<'sets' | 'volume'>('sets');
  const today = localDate(new Date(), tz);
  const from = periodStart(period, today);

  const derived = useMemo(() => {
    if (!data) return null;
    const sessionDate = new Map(data.sessions.map((s) => [s.id, s.session_date]));
    const exList = exercisesWithData(data.sets, data.sessionExercises, sessionDate, from);
    return { sessionDate, exList };
  }, [data, from]);

  const selectedEx = exerciseId && derived?.exList.some((e) => e.id === exerciseId) ? exerciseId : derived?.exList[0]?.id ?? '';

  const charts = useMemo(() => {
    if (!data || !derived || !catalog) return null;
    const { sessionDate } = derived;
    const ls = selectedEx ? loadSeries(data.sets, sessionDate, selectedEx, from) : null;
    const vol = volScope === 'exercise' && ls ? ls.volume : sessionVolumes(data.sets, data.sessions, from);
    const freq = weeklyFrequency(data.sessions, from, today);
    const dur = durations(data.sessions, from);
    const types = byType(data.sets, (id) => catalog.exercises.get(id)?.type_id ?? null, sessionDate, from);
    const typeEntries = [...types.entries()].sort((a, b) => b[1][typeMetric] - a[1][typeMetric]);
    return {
      load: ls && ls.maxW.length ? line('Maior carga (kg)', ls.maxW, SERIES[0], { label: '1RM estimado (kg)', pts: ls.best1rm, color: SERIES[1] }) : null,
      volume: vol.length ? bar('Volume (kg)', vol.map((p) => formatDateShort(p.date)), vol.map((p) => p.value), SERIES[0]) : null,
      freq: freq.length ? bar('Treinos', freq.map((p) => formatDateShort(p.date)), freq.map((p) => p.value), SERIES[2]) : null,
      dur: dur.length ? line('Duração (min)', dur, SERIES[4]) : null,
      types: typeEntries.length ? bar(typeMetric === 'sets' ? 'Séries' : 'Volume (kg)',
        typeEntries.map(([id]) => catalog.types.get(id)?.name ?? 'Sem tipo'),
        typeEntries.map(([, v]) => Math.round(v[typeMetric])),
        typeEntries.map(([id]) => catalog.types.get(id)?.color ?? '#94A3B8'), true) : null,
    };
  }, [data, derived, catalog, selectedEx, from, volScope, typeMetric, today]);

  if (error) return <><PersonPicker /><p className="error-text">{error}</p></>;
  if (!data || !derived || !charts) return <><PersonPicker /><Spinner /></>;

  const { current, best } = streaksFor(data.routineDays, data.sessions, today);
  const prs = data.sets.filter((s) => s.is_pr).sort((a, b) => b.logged_at.localeCompare(a.logged_at)).slice(0, 10);
  const seName = new Map(data.sessionExercises.map((s) => [s.id, s.exercise_name_snapshot]));
  const q = isSelf ? '' : `?u=${viewedId}`;
  const history = [...data.sessions].sort((a, b) => b.session_date.localeCompare(a.session_date)).slice(0, 30);

  return (
    <>
      <h1>Progresso</h1>
      <PersonPicker />
      <div className="tabs" role="tablist" aria-label="Período">
        {PERIODS.map((p) => <button key={p.id} role="tab" aria-selected={period === p.id} onClick={() => setPeriod(p.id)}>{p.label}</button>)}
      </div>

      <div className="stats">
        <div className="card stat"><strong className="row"><Icon name="flame" />{current}</strong><span>sequência atual</span></div>
        <div className="card stat"><strong>{best}</strong><span>recorde de sequência</span></div>
        <div className="card stat"><strong>{data.sessions.filter((s) => s.status === 'finished' && s.session_date >= from).length}</strong><span>treinos no período</span></div>
      </div>

      <h2 className="section-title">Calendário</h2>
      <div className="card">
        <Calendar sessions={data.sessions} today={today} onPick={(s) => nav(`/sessao/${s.id}${q}`)} />
      </div>

      <h2 className="section-title">Carga por exercício</h2>
      <div className="card">
        {derived.exList.length === 0 ? <Empty icon="chart" title="Sem registros no período" /> : (
          <>
            <select className="input" aria-label="Exercício" value={selectedEx} onChange={(e) => setExerciseId(e.target.value)} style={{ marginBottom: 12 }}>
              {derived.exList.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            {charts.load && <Chart config={charts.load} label="Gráfico de maior carga e 1RM estimado por sessão" />}
          </>
        )}
      </div>

      <h2 className="section-title">Volume por sessão</h2>
      <div className="card">
        <div className="tabs" role="tablist" aria-label="Escopo do volume">
          <button role="tab" aria-selected={volScope === 'session'} onClick={() => setVolScope('session')}>Treino inteiro</button>
          <button role="tab" aria-selected={volScope === 'exercise'} onClick={() => setVolScope('exercise')} disabled={!selectedEx}>Exercício selecionado</button>
        </div>
        {charts.volume ? <Chart config={charts.volume} label="Gráfico de volume por sessão" /> : <p className="muted small">Sem dados.</p>}
      </div>

      <h2 className="section-title">Frequência semanal</h2>
      <div className="card">{charts.freq ? <Chart config={charts.freq} label="Treinos concluídos por semana" /> : <p className="muted small">Sem dados.</p>}</div>

      <h2 className="section-title">Duração dos treinos</h2>
      <div className="card">{charts.dur ? <Chart config={charts.dur} label="Duração dos treinos em minutos" /> : <p className="muted small">Sem treinos finalizados no período.</p>}</div>

      <h2 className="section-title">Distribuição por tipo</h2>
      <div className="card">
        <div className="tabs" role="tablist" aria-label="Métrica">
          <button role="tab" aria-selected={typeMetric === 'sets'} onClick={() => setTypeMetric('sets')}>Séries</button>
          <button role="tab" aria-selected={typeMetric === 'volume'} onClick={() => setTypeMetric('volume')}>Volume</button>
        </div>
        {charts.types ? <Chart config={charts.types} label="Distribuição por tipo de exercício" height={260} /> : <p className="muted small">Sem dados.</p>}
      </div>

      <h2 className="section-title">Recordes recentes</h2>
      {prs.length === 0 ? <p className="muted small">Nenhum recorde ainda. Continue treinando!</p> : (
        <div className="card">
          <ul className="list">
            {prs.map((p) => (
              <li key={p.id} className="row between">
                <span className="grow"><strong>{seName.get(p.session_exercise_id) ?? 'Exercício'}</strong><br /><span className="small muted">{formatDateShort(derived.sessionDate.get(p.session_id) ?? p.logged_at.slice(0, 10))} · {setLabel(p)}</span></span>
                <PrBadge kinds={p.pr_kinds} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <h2 className="section-title">Histórico</h2>
      {history.length === 0 ? <Empty icon="calendar" title="Nenhum treino registrado" /> : (
        <div className="card">
          <ul className="list">
            {history.map((s) => (
              <li key={s.id}>
                <Link to={`/sessao/${s.id}${q}`} className="row between" style={{ color: 'inherit', textDecoration: 'none', minHeight: 44 }}>
                  <span className="grow"><strong>{formatDateShort(s.session_date, true)}</strong> · {s.title_snapshot || 'Treino'}</span>
                  <span className="small muted">
                    {s.status === 'finished' ? formatDuration(s.duration_seconds) : s.status === 'skipped' ? 'não treinou' : 'incompleto'}
                  </span>
                  <Icon name="right" size={16} />
                </Link>
              </li>
            ))}
          </ul>
          <p className="muted tiny mb0">Volume total do período: {formatNumber(Math.round(sessionVolumes(data.sets, data.sessions, from).reduce((a, p) => a + p.value, 0)))} kg</p>
        </div>
      )}
    </>
  );
}
