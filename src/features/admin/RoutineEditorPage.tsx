import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { Exercise, ExerciseType, RoutineDay, RoutineExercise } from '../../lib/types';
import { WEEKDAYS, WEEKDAYS_SHORT, formatClock, todayWeekday } from '../../lib/dates';
import { newId } from '../../lib/db';
import { BackLink } from '../../components/BackLink';
import { TypeBadge } from '../../components/Badge';
import { Empty, Spinner } from '../../components/Empty';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { NumberInput } from '../../components/NumberInput';
import { PersonSelect } from '../../components/PersonPicker';
import { useToast } from '../../components/Toast';
import { useAuth } from '../auth/AuthProvider';
import { afterAdminWrite, friendlyError } from './useCatalog';
import { normalizeSearch } from './LibraryPage';

type ExDraft = Pick<RoutineExercise, 'id' | 'exercise_id' | 'target_sets' | 'target_reps' | 'target_weight_kg' | 'rest_seconds' | 'notes'>;
interface DayDraft { id: string; weekday: number; is_rest: boolean; title: string; scheduled_time: string; exercises: ExDraft[] }

function toDraft(day: RoutineDay, exs: RoutineExercise[]): DayDraft {
  return {
    id: day.id, weekday: day.weekday, is_rest: day.is_rest, title: day.title ?? '', scheduled_time: formatClock(day.scheduled_time),
    exercises: exs.filter((e) => e.routine_day_id === day.id).sort((a, b) => a.position - b.position)
      .map(({ id, exercise_id, target_sets, target_reps, target_weight_kg, rest_seconds, notes }) => ({
        id, exercise_id, target_sets, target_reps, target_weight_kg: target_weight_kg === null ? null : Number(target_weight_kg), rest_seconds, notes,
      })),
  };
}

export default function RoutineEditorPage() {
  const { userId: me } = useAuth();
  const params = useParams();
  const userId = params.userId ?? me!;
  const nav = useNavigate();
  const toast = useToast();
  const [original, setOriginal] = useState<DayDraft[] | null>(null);
  const [days, setDays] = useState<DayDraft[] | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [types, setTypes] = useState<ExerciseType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(todayWeekday());
  const [picker, setPicker] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const [d, re, ex, ty] = await Promise.all([
      supabase.from('routine_days').select('*').eq('user_id', userId).order('weekday'),
      supabase.from('routine_exercises').select('*').eq('user_id', userId).is('deleted_at', null),
      supabase.from('exercises').select('*').is('deleted_at', null).order('name'),
      supabase.from('exercise_types').select('*').is('deleted_at', null).order('name'),
    ]);
    const err = d.error || re.error || ex.error || ty.error;
    if (err) { setError(friendlyError(err)); return; }
    const drafts = (d.data as RoutineDay[]).map((day) => toDraft(day, re.data as RoutineExercise[]));
    setOriginal(drafts);
    setDays(structuredClone(drafts));
    setExercises(ex.data as Exercise[]);
    setTypes(ty.data as ExerciseType[]);
  }, [userId]);
  useEffect(() => { setDays(null); void load(); }, [load]);

  const exMap = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const typeMap = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const dirty = JSON.stringify(days) !== JSON.stringify(original);

  // aviso ao sair com alterações
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const day = days?.find((d) => d.weekday === active);
  const patchDay = (patch: Partial<DayDraft>) => setDays((ds) => ds!.map((d) => (d.weekday === active ? { ...d, ...patch } : d)));
  const patchEx = (idx: number, patch: Partial<ExDraft>) => patchDay({ exercises: day!.exercises.map((e, i) => (i === idx ? { ...e, ...patch } : e)) });
  const moveEx = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (!day || j < 0 || j >= day.exercises.length) return;
    const list = [...day.exercises];
    [list[idx], list[j]] = [list[j], list[idx]];
    patchDay({ exercises: list });
  };

  async function save() {
    if (!days || !original) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      for (const d of days) {
        const o = original.find((x) => x.weekday === d.weekday)!;
        if (d.is_rest !== o.is_rest || d.title !== o.title || d.scheduled_time !== o.scheduled_time) {
          const r = await supabase.from('routine_days').update({
            is_rest: d.is_rest, title: d.title.trim() || null, scheduled_time: d.scheduled_time || null,
          }).eq('id', d.id);
          if (r.error) throw r.error;
        }
        const origById = new Map(o.exercises.map((e, i) => [e.id, { ...e, position: i }]));
        const upserts = d.exercises
          .map((e, i) => ({ ...e, position: i }))
          .filter((e) => JSON.stringify(e) !== JSON.stringify(origById.get(e.id)))
          .map((e) => ({ ...e, routine_day_id: d.id, user_id: userId, deleted_at: null }));
        if (upserts.length) {
          const r = await supabase.from('routine_exercises').upsert(upserts, { onConflict: 'id' });
          if (r.error) throw r.error;
        }
        const removed = o.exercises.filter((e) => !d.exercises.some((x) => x.id === e.id)).map((e) => e.id);
        if (removed.length) {
          const r = await supabase.from('routine_exercises').update({ deleted_at: now }).in('id', removed);
          if (r.error) throw r.error;
        }
      }
      toast.show(userId === me ? 'Treino salvo' : 'Treino salvo. A pessoa recebe um único aviso em alguns minutos.');
      afterAdminWrite();
      await load();
    } catch (e) {
      toast.show(`Erro ao salvar: ${friendlyError(e as { message: string })}`);
    } finally {
      setSaving(false);
    }
  }

  function addExercise(ex: Exercise) {
    if (!day) return;
    patchDay({ is_rest: false, exercises: [...day.exercises, { id: newId(), exercise_id: ex.id, target_sets: 3, target_reps: '10', target_weight_kg: null, rest_seconds: 60, notes: null }] });
    setPicker(false);
  }

  function copyTo(targets: number[]) {
    if (!day) return;
    setDays((ds) => ds!.map((d) => targets.includes(d.weekday)
      ? { ...d, is_rest: day.is_rest, title: day.title, exercises: day.exercises.map((e) => ({ ...e, id: newId() })) }
      : d));
    setCopyOpen(false);
    toast.show(`Copiado para ${targets.map((t) => WEEKDAYS_SHORT[t - 1]).join(', ')}. Lembre de salvar.`);
  }

  return (
    <div className="has-footer">
      <BackLink to="/admin" label="Admin" />
      <h1>Editor de treino</h1>
      <label className="row" style={{ marginBottom: 12 }}>
        <span className="label">Pessoa:</span>
        <PersonSelect value={userId} onChange={(id) => {
          if (dirty && !confirm('Descartar alterações não salvas?')) return;
          nav(`/admin/treino/${id}`);
        }} />
      </label>
      {error && <p className="error-text" role="alert">{error} <button className="btn sm secondary" onClick={() => void load()}>Tentar de novo</button></p>}
      {!days ? (!error && <Spinner />) : (
        <>
          <div className="tabs" role="tablist" aria-label="Dias da semana">
            {days.map((d) => (
              <button key={d.weekday} role="tab" aria-selected={d.weekday === active} onClick={() => setActive(d.weekday)}>
                {WEEKDAYS_SHORT[d.weekday - 1]}{!d.is_rest && <span aria-hidden> •</span>}
              </button>
            ))}
          </div>
          {day && (
            <section aria-label={WEEKDAYS[day.weekday - 1]}>
              <div className="card">
                <div className="row between wrap">
                  <h2 className="mb0">{WEEKDAYS[day.weekday - 1]}</h2>
                  <div className="tabs" style={{ margin: 0 }} role="radiogroup" aria-label="Tipo do dia">
                    <button role="radio" aria-selected={!day.is_rest} aria-checked={!day.is_rest} onClick={() => patchDay({ is_rest: false })}>Treino</button>
                    <button role="radio" aria-selected={day.is_rest} aria-checked={day.is_rest} onClick={() => patchDay({ is_rest: true })}>Descanso</button>
                  </div>
                </div>
                {!day.is_rest && (
                  <div className="row wrap mt" style={{ alignItems: 'flex-end' }}>
                    <label className="field grow" style={{ minWidth: 180 }}><span>Título</span>
                      <input className="input" placeholder="Ex.: Peito e Tríceps" value={day.title} onChange={(e) => patchDay({ title: e.target.value })} />
                    </label>
                    <label className="field"><span>Horário</span>
                      <input className="input" type="time" value={day.scheduled_time} onChange={(e) => patchDay({ scheduled_time: e.target.value })} />
                    </label>
                  </div>
                )}
              </div>

              {!day.is_rest && (
                <>
                  {day.exercises.length === 0 && <Empty icon="dumbbell" title="Nenhum exercício neste dia" />}
                  {day.exercises.map((e, i) => {
                    const ex = exMap.get(e.exercise_id);
                    return (
                      <div className="card" key={e.id}>
                        <div className="row between">
                          <div className="grow">
                            <strong>{i + 1}. {ex?.name ?? 'Exercício removido'}</strong>
                            <div><TypeBadge type={ex?.type_id ? typeMap.get(ex.type_id) : null} /></div>
                          </div>
                          <button className="btn ghost icon-btn" aria-label="Subir" disabled={i === 0} onClick={() => moveEx(i, -1)}><Icon name="up" /></button>
                          <button className="btn ghost icon-btn" aria-label="Descer" disabled={i === day.exercises.length - 1} onClick={() => moveEx(i, 1)}><Icon name="down" /></button>
                        </div>
                        <div className="editor-grid mt">
                          <label className="field"><span>Séries</span>
                            <NumberInput label="Séries" value={e.target_sets} onChange={(v) => patchEx(i, { target_sets: Math.max(1, v ?? 1) })} />
                          </label>
                          <label className="field"><span>Reps</span>
                            <input className="input num" aria-label="Repetições" placeholder="8-12" value={e.target_reps ?? ''} onChange={(ev) => patchEx(i, { target_reps: ev.target.value || null })} />
                          </label>
                          <label className="field"><span>Carga (kg)</span>
                            <NumberInput decimal label="Carga-alvo em kg" value={e.target_weight_kg} onChange={(v) => patchEx(i, { target_weight_kg: v })} />
                          </label>
                          <label className="field"><span>Descanso (s)</span>
                            <NumberInput label="Descanso em segundos" value={e.rest_seconds} onChange={(v) => patchEx(i, { rest_seconds: v })} />
                          </label>
                        </div>
                        <label className="field"><span>Observação</span>
                          <input className="input" value={e.notes ?? ''} onChange={(ev) => patchEx(i, { notes: ev.target.value || null })} />
                        </label>
                        <div className="row">
                          <button className="btn ghost sm" onClick={() => patchDay({ exercises: [...day.exercises.slice(0, i + 1), { ...e, id: newId() }, ...day.exercises.slice(i + 1)] })}>
                            <Icon name="copy" size={18} /> Duplicar
                          </button>
                          <button className="btn ghost sm" style={{ color: 'var(--danger)' }} onClick={() => patchDay({ exercises: day.exercises.filter((_, k) => k !== i) })}>
                            <Icon name="trash" size={18} /> Remover
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  <div className="row wrap">
                    <button className="btn secondary" onClick={() => setPicker(true)}><Icon name="plus" /> Adicionar exercício</button>
                    <button className="btn ghost" onClick={() => setCopyOpen(true)}><Icon name="copy" /> Copiar dia para…</button>
                  </div>
                </>
              )}
              {day.is_rest && <Empty icon="rest" title="Dia de descanso" />}
            </section>
          )}
          <div className="fixed-footer">
            <div className="inner row between">
              <span className="muted small">{dirty ? 'Alterações não salvas' : 'Tudo salvo'}</span>
              <div className="row">
                {dirty && <button className="btn secondary" onClick={() => setDays(structuredClone(original))}>Descartar</button>}
                <button className="btn" disabled={!dirty || saving} onClick={save}>{saving ? 'Salvando…' : 'Salvar'}</button>
              </div>
            </div>
          </div>
        </>
      )}
      {picker && <ExercisePicker exercises={exercises} types={types} onPick={addExercise} onClose={() => setPicker(false)} />}
      {copyOpen && day && <CopyDayModal from={day.weekday} onCopy={copyTo} onClose={() => setCopyOpen(false)} />}
    </div>
  );
}

function ExercisePicker({ exercises, types, onPick, onClose }: { exercises: Exercise[]; types: ExerciseType[]; onPick: (e: Exercise) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [typeId, setTypeId] = useState('');
  const typeMap = new Map(types.map((t) => [t.id, t]));
  const list = exercises.filter((e) => (!typeId || e.type_id === typeId) && (!q || normalizeSearch(e.name).includes(normalizeSearch(q))));
  return (
    <Modal title="Adicionar exercício" onClose={onClose}>
      <input className="input" type="search" placeholder="Buscar…" aria-label="Buscar exercício" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="row wrap" style={{ margin: '8px 0' }}>
        <button className={`btn sm ${typeId ? 'secondary' : ''}`} onClick={() => setTypeId('')}>Todos</button>
        {types.map((t) => <button key={t.id} className={`btn sm ${typeId === t.id ? '' : 'secondary'}`} onClick={() => setTypeId(t.id)}>{t.name}</button>)}
      </div>
      {list.length === 0 ? <Empty icon="dumbbell" title="Nada encontrado">Cadastre exercícios na Biblioteca.</Empty> : (
        <ul className="list">
          {list.map((e) => (
            <li key={e.id}>
              <button className="btn ghost block" style={{ justifyContent: 'space-between' }} onClick={() => onPick(e)}>
                <span>{e.name}</span><TypeBadge type={e.type_id ? typeMap.get(e.type_id) : null} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function CopyDayModal({ from, onCopy, onClose }: { from: number; onCopy: (t: number[]) => void; onClose: () => void }) {
  const [sel, setSel] = useState<number[]>([]);
  return (
    <Modal title={`Copiar ${WEEKDAYS[from - 1]} para…`} onClose={onClose} actions={<>
      <button className="btn secondary" onClick={onClose}>Cancelar</button>
      <button className="btn" disabled={!sel.length} onClick={() => onCopy(sel)}>Copiar</button>
    </>}>
      <p className="muted small">Substitui título e exercícios dos dias escolhidos (o horário é mantido).</p>
      {WEEKDAYS.map((w, i) => i + 1 !== from && (
        <label key={w} className="checkbox" style={{ display: 'flex' }}>
          <input type="checkbox" checked={sel.includes(i + 1)} onChange={(e) => setSel((s) => e.target.checked ? [...s, i + 1] : s.filter((x) => x !== i + 1))} />
          {w}
        </label>
      ))}
    </Modal>
  );
}
