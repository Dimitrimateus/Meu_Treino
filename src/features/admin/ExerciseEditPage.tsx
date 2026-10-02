import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { exerciseMediaUrl, supabase } from '../../lib/supabase';
import type { ExerciseMedia } from '../../lib/types';
import { compressImage, MAX_GIF_BYTES } from '../../lib/image';
import { newId } from '../../lib/db';
import { BackLink } from '../../components/BackLink';
import { ConfirmDialog } from '../../components/Modal';
import { Spinner } from '../../components/Empty';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { afterAdminWrite, friendlyError, useTypes } from './useCatalog';

export default function ExerciseEditPage() {
  const { id } = useParams();
  const isNew = id === 'novo';
  const nav = useNavigate();
  const toast = useToast();
  const { rows: types } = useTypes();
  const [loaded, setLoaded] = useState(isNew);
  const [name, setName] = useState('');
  const [typeId, setTypeId] = useState('');
  const [description, setDescription] = useState('');
  const [media, setMedia] = useState<ExerciseMedia[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (isNew) return;
    (async () => {
      const [{ data: ex, error: e1 }, { data: m }] = await Promise.all([
        supabase.from('exercises').select('*').eq('id', id!).maybeSingle(),
        supabase.from('exercise_media').select('*').eq('exercise_id', id!).is('deleted_at', null).order('position'),
      ]);
      if (e1 || !ex) { setError(friendlyError(e1) ?? 'Exercício não encontrado'); setLoaded(true); return; }
      setName(ex.name); setTypeId(ex.type_id ?? ''); setDescription(ex.description ?? '');
      setMedia((m ?? []) as ExerciseMedia[]);
      setLoaded(true);
    })();
  }, [id, isNew]);

  useEffect(() => { if (isNew && !typeId && types?.length) setTypeId(types[0].id); }, [isNew, typeId, types]);

  async function save(e?: FormEvent) {
    e?.preventDefault();
    if (!name.trim()) { setError('Informe o nome.'); return null; }
    setBusy(true); setError(null);
    const row = { name: name.trim(), type_id: typeId || null, description: description.trim() || null };
    const res = isNew
      ? await supabase.from('exercises').insert(row).select('id').single()
      : await supabase.from('exercises').update(row).eq('id', id!).select('id').single();
    setBusy(false);
    if (res.error) { setError(friendlyError(res.error)); return null; }
    afterAdminWrite();
    if (isNew) { toast.show('Exercício criado. Agora você pode adicionar fotos/GIFs.'); nav(`/admin/exercicios/${res.data.id}`, { replace: true }); }
    else toast.show('Salvo');
    return res.data.id as string;
  }

  async function upload(files: FileList | null) {
    if (!files?.length || isNew) return;
    for (const file of Array.from(files)) {
      const isGif = file.type === 'image/gif';
      if (!file.type.startsWith('image/')) { toast.show(`${file.name}: só imagens e GIFs (sem vídeo)`); continue; }
      if (isGif && file.size > MAX_GIF_BYTES) { toast.show(`${file.name}: GIF maior que 5 MB`); continue; }
      setUploading((n) => n + 1);
      try {
        const blob = isGif ? file : await compressImage(file, { maxSide: 1600, quality: 0.8 });
        const mid = newId();
        const path = `${id}/${mid}.${isGif ? 'gif' : 'jpg'}`;
        const up = await supabase.storage.from('exercise-media').upload(path, blob, { contentType: isGif ? 'image/gif' : 'image/jpeg', cacheControl: '31536000' });
        if (up.error) throw up.error;
        const position = media.length ? Math.max(...media.map((m) => m.position)) + 1 : 0;
        const ins = await supabase.from('exercise_media').insert({ id: mid, exercise_id: id, storage_path: path, kind: isGif ? 'gif' : 'image', position }).select('*').single();
        if (ins.error) throw ins.error;
        setMedia((l) => [...l, ins.data as ExerciseMedia]);
      } catch (err) {
        toast.show(`Falha no envio: ${friendlyError(err as { message: string })}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    afterAdminWrite();
  }

  async function move(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= media.length) return;
    const next = [...media];
    [next[idx], next[j]] = [next[j], next[idx]];
    const withPos = next.map((m, i) => ({ ...m, position: i }));
    setMedia(withPos);
    await Promise.all(withPos.map((m) => supabase.from('exercise_media').update({ position: m.position }).eq('id', m.id)));
    afterAdminWrite();
  }

  async function removeMedia(m: ExerciseMedia) {
    const { error } = await supabase.from('exercise_media').update({ deleted_at: new Date().toISOString() }).eq('id', m.id);
    if (error) { toast.show(friendlyError(error)!); return; }
    await supabase.storage.from('exercise-media').remove([m.storage_path]);
    setMedia((l) => l.filter((x) => x.id !== m.id));
    afterAdminWrite();
  }

  async function removeExercise() {
    const { error } = await supabase.from('exercises').update({ deleted_at: new Date().toISOString() }).eq('id', id!);
    if (error) { toast.show(friendlyError(error)!); return; }
    // remove também dos treinos (o histórico usa o snapshot do nome)
    await supabase.from('routine_exercises').update({ deleted_at: new Date().toISOString() }).eq('exercise_id', id!).is('deleted_at', null);
    afterAdminWrite();
    toast.show('Exercício excluído');
    nav('/admin/exercicios', { replace: true });
  }

  if (!loaded) return <Spinner />;
  return (
    <>
      <BackLink to="/admin/exercicios" label="Exercícios" />
      <h1>{isNew ? 'Novo exercício' : 'Editar exercício'}</h1>
      <form className="card" onSubmit={save}>
        <label className="field"><span>Nome</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label className="field"><span>Tipo</span>
          <select className="input" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            <option value="">Sem tipo</option>
            {(types ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Como executar (descrição)</span>
          <textarea className="input" rows={6} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        {error && <p className="error-text" role="alert">{error}</p>}
        <button className="btn block" disabled={busy}>{busy ? 'Salvando…' : isNew ? 'Criar exercício' : 'Salvar'}</button>
      </form>

      {!isNew && (
        <>
          <h2 className="section-title">Fotos e GIFs</h2>
          <div className="card">
            {media.length === 0 && <p className="muted small">Nenhuma mídia. Sem vídeos — apenas fotos e GIFs (até 5 MB).</p>}
            <div className="media-grid">
              {media.map((m, i) => (
                <figure key={m.id} className="media-item">
                  <img src={exerciseMediaUrl(m.storage_path)} alt={`Mídia ${i + 1} de ${name}`} loading="lazy" />
                  <figcaption className="row">
                    <button type="button" className="btn ghost icon-btn" aria-label="Mover para a esquerda" disabled={i === 0} onClick={() => move(i, -1)}><Icon name="left" /></button>
                    <button type="button" className="btn ghost icon-btn" aria-label="Mover para a direita" disabled={i === media.length - 1} onClick={() => move(i, 1)}><Icon name="right" /></button>
                    <button type="button" className="btn ghost icon-btn" aria-label="Remover mídia" onClick={() => removeMedia(m)}><Icon name="trash" /></button>
                  </figcaption>
                </figure>
              ))}
            </div>
            <label className="btn secondary block mt">
              <Icon name="image" /> {uploading ? `Enviando (${uploading})…` : 'Adicionar fotos/GIFs'}
              <input type="file" accept="image/*" multiple hidden onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} />
            </label>
          </div>
          <button className="btn secondary block mt" style={{ color: 'var(--danger)' }} onClick={() => setConfirmDelete(true)}>Excluir exercício</button>
        </>
      )}
      {confirmDelete && (
        <ConfirmDialog title="Excluir exercício?" danger confirmLabel="Excluir" onCancel={() => setConfirmDelete(false)} onConfirm={removeExercise}
          message={<p>Ele será removido da biblioteca e dos treinos. O histórico de registros continua guardado.</p>} />
      )}
    </>
  );
}
