import { useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ChartConfiguration } from 'chart.js';
import { useAuth } from '../auth/AuthProvider';
import { useViewedPerson } from '../../lib/people';
import { usePersonData } from '../../lib/data/personData';
import { deleteBodyWeight, saveBodyWeight } from '../../lib/data/actions';
import { DEFAULT_TZ, formatDateShort, localDate } from '../../lib/dates';
import { formatKg } from '../../lib/numbers';
import { movingAverage, periodStart, type Period } from '../../lib/progress';
import type { BodyWeightLog } from '../../lib/types';
import { Chart, SERIES } from '../../components/Chart';
import { PersonPicker } from '../../components/PersonPicker';
import { Empty, Spinner } from '../../components/Empty';
import { Icon } from '../../components/Icon';
import { NumberInput } from '../../components/NumberInput';
import { useToast } from '../../components/Toast';
import { PhotosTab } from '../photos/PhotosTab';

const PERIODS: { id: Period; label: string }[] = [
  { id: '30', label: '30 dias' }, { id: '90', label: '90 dias' }, { id: '365', label: '1 ano' }, { id: 'all', label: 'Tudo' },
];

export default function WeightPage() {
  const { tz: myTz } = useAuth();
  const { viewedId, isSelf, viewed } = useViewedPerson();
  const tz = viewed?.timezone || myTz || DEFAULT_TZ;
  const [params, setParams] = useSearchParams();
  const tab = params.get('aba') === 'fotos' ? 'fotos' : 'peso';
  const setTab = (t: string) => { const n = new URLSearchParams(params); if (t === 'peso') n.delete('aba'); else n.set('aba', t); setParams(n, { replace: true }); };
  const { data, error } = usePersonData(viewedId, isSelf);

  return (
    <>
      <h1>Peso e fotos</h1>
      <PersonPicker />
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'peso'} onClick={() => setTab('peso')}>Peso</button>
        <button role="tab" aria-selected={tab === 'fotos'} onClick={() => setTab('fotos')}>Fotos</button>
      </div>
      {error ? <p className="error-text">{error}</p> : !data ? <Spinner /> : tab === 'peso'
        ? <WeightTab weights={data.weights} userId={viewedId} isSelf={isSelf} tz={tz} />
        : <PhotosTab photos={data.photos} weights={data.weights} userId={viewedId} isSelf={isSelf} tz={tz} />}
    </>
  );
}

function WeightTab({ weights, userId, isSelf, tz }: { weights: BodyWeightLog[]; userId: string; isSelf: boolean; tz: string }) {
  const toast = useToast();
  const today = localDate(new Date(), tz);
  const [period, setPeriod] = useState<Period>('90');
  const [showAvg, setShowAvg] = useState(true);
  const [date, setDate] = useState(today);
  const [kg, setKg] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const sorted = useMemo(() => [...weights].sort((a, b) => a.measured_on.localeCompare(b.measured_on)), [weights]);
  const from = periodStart(period, today);
  const inPeriod = sorted.filter((w) => w.measured_on >= from);
  const todays = weights.find((w) => w.measured_on === date);

  const config = useMemo<ChartConfiguration | null>(() => {
    if (inPeriod.length === 0) return null;
    const pts = inPeriod.map((w) => ({ date: w.measured_on, value: Number(w.weight_kg) }));
    const avg = movingAverage(pts, 7);
    return {
      type: 'line',
      data: {
        labels: pts.map((p) => formatDateShort(p.date)),
        datasets: [
          { label: 'Peso (kg)', data: pts.map((p) => p.value), borderColor: SERIES[0], backgroundColor: SERIES[0], pointRadius: 3, tension: 0.2 },
          ...(showAvg && pts.length > 2 ? [{ label: 'Média 7 dias', data: avg.map((p) => p.value), borderColor: SERIES[1], backgroundColor: SERIES[1], pointRadius: 0, borderDash: [6, 4], tension: 0.2 }] : []),
        ],
      },
      options: { scales: { y: { beginAtZero: false } } },
    };
  }, [inPeriod, showAvg]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = kg ?? (todays ? Number(todays.weight_kg) : null);
    if (value === null || value < 20 || value > 400) { toast.show('Informe um peso entre 20 e 400 kg'); return; }
    await saveBodyWeight(userId, date, value, note.trim() || null);
    setKg(null); setNote('');
    toast.show(`Peso salvo: ${formatKg(value)}`);
  }

  const variation = inPeriod.length >= 2 ? Number(inPeriod[inPeriod.length - 1].weight_kg) - Number(inPeriod[0].weight_kg) : null;
  const last = sorted[sorted.length - 1];

  return (
    <>
      {isSelf && (
        <form className="card" onSubmit={submit}>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <label className="field grow"><span>Data</span><input className="input" type="date" value={date} max={today} onChange={(e) => { setDate(e.target.value); setKg(null); }} /></label>
            <label className="field grow"><span>Peso (kg)</span>
              <NumberInput decimal label="Peso em kg" value={kg ?? (todays ? Number(todays.weight_kg) : null)} onChange={setKg} placeholder="Ex.: 61,5" />
            </label>
          </div>
          <label className="field"><span>Observação (opcional)</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <button className="btn block">{todays ? 'Atualizar peso do dia' : 'Salvar peso'}</button>
        </form>
      )}
      <div className="stats">
        <div className="card stat"><strong>{formatKg(last ? Number(last.weight_kg) : null)}</strong><span>último{last && ` · ${formatDateShort(last.measured_on)}`}</span></div>
        <div className="card stat"><strong>{variation === null ? '—' : `${variation > 0 ? '+' : ''}${formatKg(Math.round(variation * 100) / 100)}`}</strong><span>variação no período</span></div>
      </div>
      <div className="tabs" role="tablist" aria-label="Período">
        {PERIODS.map((p) => <button key={p.id} role="tab" aria-selected={period === p.id} onClick={() => setPeriod(p.id)}>{p.label}</button>)}
      </div>
      <div className="card">
        {config ? <Chart config={config} label="Gráfico de peso corporal" /> : <Empty icon="scale" title="Sem registros no período" />}
        {inPeriod.length > 2 && (
          <label className="checkbox small"><input type="checkbox" checked={showAvg} onChange={(e) => setShowAvg(e.target.checked)} />Média móvel de 7 dias</label>
        )}
      </div>
      <h2 className="section-title">Registros</h2>
      {sorted.length === 0 ? <Empty icon="scale" title="Nenhum peso registrado" /> : (
        <div className="card">
          <ul className="list">
            {[...sorted].reverse().slice(0, 60).map((w) => (
              <li key={w.id} className="row between">
                <span className="grow">{formatDateShort(w.measured_on, true)}{w.note && <span className="muted small"> · {w.note}</span>}</span>
                <strong>{formatKg(Number(w.weight_kg))}</strong>
                {isSelf && (
                  <button className="btn ghost icon-btn" aria-label={`Excluir peso de ${formatDateShort(w.measured_on)}`} onClick={async () => {
                    if (!confirm('Excluir este registro de peso?')) return;
                    const err = await deleteBodyWeight(w.id);
                    toast.show(err ?? 'Registro excluído');
                  }}><Icon name="trash" size={18} /></button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
