import { useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import type { ExerciseType } from '../../lib/types';
import { BackLink } from '../../components/BackLink';
import { Modal } from '../../components/Modal';
import { Empty, Spinner } from '../../components/Empty';
import { useToast } from '../../components/Toast';
import { afterAdminWrite, friendlyError, useExercises, useTypes } from './useCatalog';

export const TYPE_COLORS = ['#2563EB', '#0891B2', '#16A34A', '#7C3AED', '#DB2777', '#EA580C', '#CA8A04', '#DC2626', '#475569', '#0D9488'];

export default function TypesPage() {
  const { rows: types, error, reload } = useTypes();
  const { rows: exercises, reload: reloadEx } = useExercises();
  const [editing, setEditing] = useState<Partial<ExerciseType> | null>(null);
  const [deleting, setDeleting] = useState<ExerciseType | null>(null);
  const usage = (id: string) => exercises?.filter((e) => e.type_id === id).length ?? 0;
  return (
    <>
      <BackLink to="/admin" label="Admin" />
      <div className="row between">
        <h1 className="mb0">Tipos de exercício</h1>
        <button className="btn" onClick={() => setEditing({ name: '', color: TYPE_COLORS[0] })}>Novo tipo</button>
      </div>
      {error && <p className="error-text mt" role="alert">{error}</p>}
      {types === null ? <Spinner /> : types.length === 0 ? <Empty title="Nenhum tipo cadastrado">Crie tipos como “Peito”, “Costas”, “Pernas”.</Empty> : (
        <ul className="list card mt">
          {types.map((t) => (
            <li key={t.id} className="row">
              <span className="dot" style={{ width: 16, height: 16, borderRadius: 8, background: t.color, display: 'inline-block' }} />
              <span className="grow">{t.name} <span className="muted small">· {usage(t.id)} exercício(s)</span></span>
              <button className="btn ghost sm" onClick={() => setEditing(t)}>Editar</button>
              <button className="btn ghost sm" style={{ color: 'var(--danger)' }} onClick={() => setDeleting(t)}>Excluir</button>
            </li>
          ))}
        </ul>
      )}
      {editing && <TypeModal type={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(); afterAdminWrite(); }} />}
      {deleting && <DeleteTypeModal type={deleting} types={types ?? []} inUse={usage(deleting.id)} onClose={() => setDeleting(null)}
        onDone={() => { setDeleting(null); void reload(); void reloadEx(); afterAdminWrite(); }} />}
    </>
  );
}

function TypeModal({ type, onClose, onSaved }: { type: Partial<ExerciseType>; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(type.name ?? '');
  const [color, setColor] = useState(type.color ?? TYPE_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const q = type.id
      ? supabase.from('exercise_types').update({ name: name.trim(), color }).eq('id', type.id)
      : supabase.from('exercise_types').insert({ name: name.trim(), color });
    const { error } = await q;
    if (error) setError(friendlyError(error)); else onSaved();
  }
  return (
    <Modal title={type.id ? 'Editar tipo' : 'Novo tipo'} onClose={onClose}>
      <form onSubmit={submit}>
        <label className="field"><span>Nome</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <div className="field">
          <span>Cor</span>
          <div className="row wrap">
            {TYPE_COLORS.map((c) => (
              <button type="button" key={c} onClick={() => setColor(c)} aria-label={`Cor ${c}`} aria-pressed={color === c}
                style={{ width: 44, height: 44, borderRadius: 22, background: c, border: color === c ? '3px solid var(--text)' : '1px solid var(--border)', cursor: 'pointer' }} />
            ))}
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Outra cor" style={{ width: 44, height: 44, border: 0, background: 'none' }} />
          </div>
        </div>
        {error && <p className="error-text" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>Cancelar</button>
          <button className="btn">Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteTypeModal({ type, types, inUse, onClose, onDone }: { type: ExerciseType; types: ExerciseType[]; inUse: number; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const others = types.filter((t) => t.id !== type.id);
  const [target, setTarget] = useState(others[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    if (inUse > 0) {
      if (!target) { setBusy(false); return; }
      const r = await supabase.from('exercises').update({ type_id: target }).eq('type_id', type.id).is('deleted_at', null);
      if (r.error) { toast.show(friendlyError(r.error)!); setBusy(false); return; }
    }
    const { error } = await supabase.from('exercise_types').update({ deleted_at: new Date().toISOString() }).eq('id', type.id);
    if (error) { toast.show(friendlyError(error)!); setBusy(false); return; }
    toast.show('Tipo excluído');
    onDone();
  }
  return (
    <Modal title={`Excluir “${type.name}”?`} onClose={onClose} actions={<>
      <button className="btn secondary" onClick={onClose}>Cancelar</button>
      <button className="btn danger" disabled={busy || (inUse > 0 && !target)} onClick={run}>{inUse > 0 ? 'Reatribuir e excluir' : 'Excluir'}</button>
    </>}>
      {inUse > 0 ? (
        others.length === 0 ? <p>Este tipo está em uso por {inUse} exercício(s). Crie outro tipo antes de excluir.</p> : (
          <>
            <p>Este tipo está em uso por <strong>{inUse}</strong> exercício(s). Escolha para qual tipo eles vão:</p>
            <select className="input" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Novo tipo">
              {others.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </>
        )
      ) : <p>O tipo não está em uso.</p>}
    </Modal>
  );
}
