import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { BackLink } from '../../components/BackLink';
import { PersonSelect } from '../../components/PersonPicker';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { useAuth } from '../auth/AuthProvider';

const TABLES = ['workout_sessions', 'session_exercises', 'set_logs', 'session_events', 'body_weight_logs', 'progress_photos', 'routine_days', 'routine_exercises'] as const;

async function fetchAll(table: string, userId: string) {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').eq('user_id', userId).range(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : Array.isArray(v) ? v.join('|') : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // ";" e vírgula decimal: abre direto no Excel/LibreOffice em pt-BR
  return '﻿' + [columns.join(';'), ...rows.map((r) => columns.map((c) => {
    const v = r[c];
    return esc(typeof v === 'number' ? String(v).replace('.', ',') : v);
  }).join(';'))].join('\n');
}

export default function ExportPage() {
  const { userId } = useAuth();
  const toast = useToast();
  const [person, setPerson] = useState(userId!);
  const [busy, setBusy] = useState(false);

  async function run(kind: 'json' | 'csv') {
    setBusy(true);
    try {
      const data: Record<string, Record<string, unknown>[]> = {};
      for (const t of TABLES) data[t] = await fetchAll(t, person);
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', person).maybeSingle();
      const stamp = new Date().toISOString().slice(0, 10);
      const slug = String(profile?.name ?? 'pessoa').toLowerCase().normalize('NFD').replace(/[^\w]+/g, '-');
      if (kind === 'json') {
        download(`treinos-${slug}-${stamp}.json`, JSON.stringify({ exported_at: new Date().toISOString(), profile, ...data }, null, 2), 'application/json');
      } else {
        const sessions = new Map(data.workout_sessions.map((s) => [s.id, s]));
        const ses = new Map(data.session_exercises.map((s) => [s.id, s]));
        const sets = data.set_logs.filter((s) => !s.deleted_at).map((s) => ({
          data: (sessions.get(s.session_id) as { session_date?: string })?.session_date,
          treino: (sessions.get(s.session_id) as { title_snapshot?: string })?.title_snapshot,
          exercicio: (ses.get(s.session_exercise_id) as { exercise_name_snapshot?: string })?.exercise_name_snapshot,
          serie: s.set_number, reps: s.reps, kg: Number(s.weight_kg), pr: s.pr_kinds, registrado_em: s.logged_at, obs: s.note,
        })).sort((a, b) => String(a.registrado_em).localeCompare(String(b.registrado_em)));
        download(`series-${slug}-${stamp}.csv`, toCsv(sets, ['data', 'treino', 'exercicio', 'serie', 'reps', 'kg', 'pr', 'registrado_em', 'obs']), 'text/csv');
        const weights = data.body_weight_logs.filter((w) => !w.deleted_at).map((w) => ({ data: w.measured_on, kg: Number(w.weight_kg), obs: w.note }));
        download(`peso-${slug}-${stamp}.csv`, toCsv(weights, ['data', 'kg', 'obs']), 'text/csv');
        const sess = data.workout_sessions.filter((s) => !s.deleted_at).map((s) => ({
          data: s.session_date, treino: s.title_snapshot, status: s.status, inicio: s.started_at, fim: s.finished_at,
          duracao_min: s.duration_seconds === null ? null : Math.round(Number(s.duration_seconds) / 60), motivo: s.skip_reason,
        }));
        download(`treinos-${slug}-${stamp}.csv`, toCsv(sess, ['data', 'treino', 'status', 'inicio', 'fim', 'duracao_min', 'motivo']), 'text/csv');
      }
      toast.show('Exportação concluída');
    } catch (e) {
      toast.show(`Erro: ${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  return (
    <>
      <BackLink to="/admin" label="Admin" />
      <h1>Exportar dados</h1>
      <p className="muted">Backup manual. O plano gratuito do Supabase não garante backups — exporte de vez em quando.</p>
      <div className="card">
        <label className="row" style={{ marginBottom: 12 }}><span className="label">Pessoa:</span><PersonSelect value={person} onChange={setPerson} /></label>
        <div className="row wrap">
          <button className="btn" disabled={busy} onClick={() => void run('json')}><Icon name="download" /> JSON completo</button>
          <button className="btn secondary" disabled={busy} onClick={() => void run('csv')}><Icon name="download" /> CSV (planilhas)</button>
        </div>
        <p className="muted tiny mt mb0">As fotos ficam no Storage; o JSON traz os metadados (data, peso, caminho do arquivo).</p>
      </div>
    </>
  );
}
