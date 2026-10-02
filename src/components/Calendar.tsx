import { useState } from 'react';
import { MONTHS, WEEKDAYS_SHORT, addDays, isoWeekday } from '../lib/dates';
import type { WorkoutSession } from '../lib/types';
import { Icon } from './Icon';

interface Props { sessions: WorkoutSession[]; today: string; onPick: (s: WorkoutSession) => void }

/** Calendário mensal: treinado (azul cheio), pulado (cinza com traço), incompleto (azul vazado), descanso (sem marca), hoje (contorno). */
export function Calendar({ sessions, today, onPick }: Props) {
  const [ym, setYm] = useState(today.slice(0, 7));
  const [y, m] = ym.split('-').map(Number);
  const first = `${ym}-01`;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = isoWeekday(first) - 1;
  const byDate = new Map(sessions.map((s) => [s.session_date, s]));
  const shift = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setYm(d.toISOString().slice(0, 7));
  };
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => addDays(first, i))];
  return (
    <div className="calendar">
      <div className="row between">
        <button className="btn ghost icon-btn" onClick={() => shift(-1)} aria-label="Mês anterior"><Icon name="left" /></button>
        <strong style={{ textTransform: 'capitalize' }}>{MONTHS[m - 1]} {y}</strong>
        <button className="btn ghost icon-btn" onClick={() => shift(1)} aria-label="Próximo mês" disabled={ym >= today.slice(0, 7)}><Icon name="right" /></button>
      </div>
      <div className="cal-grid" role="grid">
        {WEEKDAYS_SHORT.map((w) => <span key={w} className="cal-h" aria-hidden>{w[0]}</span>)}
        {cells.map((d, i) => {
          if (!d) return <span key={`e${i}`} />;
          const s = byDate.get(d);
          const cls = s?.status === 'finished' ? 'done' : s?.status === 'skipped' ? 'skipped' : s?.status === 'in_progress' ? 'incomplete' : '';
          const label = `${Number(d.slice(8))}${s ? `: ${cls === 'done' ? 'treinado' : cls === 'skipped' ? 'não treinou' : 'incompleto'}` : ''}`;
          return (
            <button key={d} className={`cal-d ${cls} ${d === today ? 'today' : ''}`} disabled={!s} onClick={() => s && onPick(s)} aria-label={label}>
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>
      <div className="cal-legend small muted">
        <span><i className="cal-d done" /> treinado</span>
        <span><i className="cal-d incomplete" /> incompleto</span>
        <span><i className="cal-d skipped" /> não treinou</span>
      </div>
    </div>
  );
}
