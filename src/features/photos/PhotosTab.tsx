import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { addProgressPhoto, deleteProgressPhoto } from '../../lib/data/actions';
import { db } from '../../lib/db';
import { compressImage } from '../../lib/image';
import { formatDateShort, localDate } from '../../lib/dates';
import { formatKg } from '../../lib/numbers';
import type { BodyWeightLog, ProgressPhoto } from '../../lib/types';
import { ConfirmDialog, Modal } from '../../components/Modal';
import { Empty } from '../../components/Empty';
import { Icon } from '../../components/Icon';
import { NumberInput } from '../../components/NumberInput';
import { useToast } from '../../components/Toast';
import { PhotoImg } from './usePhotoUrl';

interface Props { photos: ProgressPhoto[]; weights: BodyWeightLog[]; userId: string; isSelf: boolean; tz: string }

export function PhotosTab({ photos, weights, userId, isSelf, tz }: Props) {
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<ProgressPhoto | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const [toDelete, setToDelete] = useState<ProgressPhoto | null>(null);
  const toast = useToast();
  const weightOf = (p: ProgressPhoto) => weights.find((w) => w.id === p.body_weight_log_id)?.weight_kg;
  const sorted = [...photos].sort((a, b) => b.taken_on.localeCompare(a.taken_on) || (b.created_at ?? '').localeCompare(a.created_at ?? ''));

  const pick = (p: ProgressPhoto) => {
    if (!compareMode) { setViewing(p); return; }
    setSelected((s) => s.includes(p.id) ? s.filter((x) => x !== p.id) : [...s.slice(-1), p.id]);
  };
  const pair = selected.map((id) => photos.find((p) => p.id === id)!).filter(Boolean)
    .sort((a, b) => a.taken_on.localeCompare(b.taken_on));

  return (
    <>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        {isSelf && <button className="btn" onClick={() => setAdding(true)}><Icon name="camera" /> Adicionar foto</button>}
        {photos.length >= 2 && (
          <button className={`btn ${compareMode ? '' : 'secondary'}`} onClick={() => { setCompareMode((v) => !v); setSelected([]); }} aria-pressed={compareMode}>
            {compareMode ? 'Cancelar comparação' : 'Comparar duas'}
          </button>
        )}
        {compareMode && <button className="btn" disabled={selected.length !== 2} onClick={() => setComparing(true)}>Ver lado a lado</button>}
      </div>
      {compareMode && <p className="muted small">Toque em duas fotos para comparar ({selected.length}/2).</p>}
      {sorted.length === 0 ? (
        <Empty icon="camera" title="Nenhuma foto ainda">{isSelf && <p className="small">Fotos são opcionais. Cada foto fica vinculada ao peso do dia.</p>}</Empty>
      ) : (
        <div className="photo-grid">
          {sorted.map((p) => (
            <button key={p.id} className={`photo-cell ${selected.includes(p.id) ? 'sel' : ''}`} onClick={() => pick(p)}
              aria-label={`Foto de ${formatDateShort(p.taken_on, true)}, ${formatKg(weightOf(p))}`} aria-pressed={compareMode ? selected.includes(p.id) : undefined}>
              <PhotoImg photo={p} alt="" />
              <span className="photo-cap">{formatDateShort(p.taken_on, true)} · {formatKg(weightOf(p))}{p._uploaded === false && ' · ⏳'}</span>
            </button>
          ))}
        </div>
      )}

      {adding && <AddPhotoModal userId={userId} tz={tz} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); toast.show('Foto salva'); }} />}
      {viewing && (
        <Modal title={`${formatDateShort(viewing.taken_on, true)} · ${formatKg(weightOf(viewing))}`} onClose={() => setViewing(null)} actions={<>
          {isSelf && <button className="btn secondary" style={{ color: 'var(--danger)' }} onClick={() => { setToDelete(viewing); setViewing(null); }}>Excluir</button>}
          <button className="btn" onClick={() => setViewing(null)}>Fechar</button>
        </>}>
          <PhotoImg photo={viewing} alt={`Foto de evolução de ${formatDateShort(viewing.taken_on, true)}`} className="photo-full" />
          {viewing.note && <p className="mt">{viewing.note}</p>}
        </Modal>
      )}
      {comparing && pair.length === 2 && (
        <Modal title="Comparativo" onClose={() => setComparing(false)} actions={<button className="btn" onClick={() => setComparing(false)}>Fechar</button>}>
          <div className="compare">
            {pair.map((p) => (
              <figure key={p.id}>
                <PhotoImg photo={p} alt={`Foto de ${formatDateShort(p.taken_on, true)}`} className="photo-full" />
                <figcaption><strong>{formatKg(weightOf(p))}</strong><br /><span className="muted small">{formatDateShort(p.taken_on, true)}</span></figcaption>
              </figure>
            ))}
          </div>
          {(() => {
            const a = weightOf(pair[0]), b = weightOf(pair[1]);
            if (a === undefined || b === undefined) return null;
            const d = Math.round((b - a) * 100) / 100;
            return <p className="center mt">Diferença: <strong>{d > 0 ? '+' : ''}{formatKg(d)}</strong></p>;
          })()}
        </Modal>
      )}
      {toDelete && (
        <ConfirmDialog title="Excluir foto?" danger confirmLabel="Excluir" onCancel={() => setToDelete(null)}
          onConfirm={async () => { await deleteProgressPhoto(toDelete.id); setToDelete(null); toast.show('Foto excluída'); }}
          message={<p>A foto será removida. O registro de peso continua.</p>} />
      )}
    </>
  );
}

function AddPhotoModal({ userId, tz, onClose, onSaved }: { userId: string; tz: string; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(localDate(new Date(), tz));
  const existing = useLiveQuery(async () => (await db.bodyWeightLogs.where('[user_id+measured_on]').equals([userId, date]).toArray()).find((w) => !w.deleted_at), [userId, date]);
  const [weight, setWeight] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const effectiveWeight = weight ?? (existing ? Number(existing.weight_kg) : null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) { setError('Escolha uma foto.'); return; }
    if (effectiveWeight === null || effectiveWeight < 20 || effectiveWeight > 400) { setError('Informe o peso do dia (toda foto exige um peso).'); return; }
    setBusy(true); setError(null);
    try {
      const blob = await compressImage(file, { maxSide: 1600, quality: 0.8, targetBytes: 400 * 1024 });
      await addProgressPhoto(userId, date, effectiveWeight, blob, note.trim() || null);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <Modal title="Adicionar foto" onClose={onClose}>
      <form onSubmit={submit}>
        <label className="btn secondary block">
          <Icon name="camera" /> {file ? 'Trocar foto' : 'Tirar ou escolher foto'}
          <input type="file" accept="image/*" hidden onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
            if (preview) URL.revokeObjectURL(preview);
            setPreview(f ? URL.createObjectURL(f) : null);
          }} />
        </label>
        {preview && <img src={preview} alt="Pré-visualização" className="photo-full mt" />}
        <div className="row mt" style={{ alignItems: 'flex-end' }}>
          <label className="field grow"><span>Data</span><input className="input" type="date" value={date} max={localDate(new Date(), tz)} onChange={(e) => { setDate(e.target.value); setWeight(null); }} /></label>
          <label className="field grow"><span>Peso (kg) *</span>
            <NumberInput decimal label="Peso do dia em kg" value={effectiveWeight} onChange={setWeight} placeholder="Ex.: 61,5" />
          </label>
        </div>
        {existing && weight === null && <p className="muted small">Usando o peso já registrado neste dia.</p>}
        <label className="field"><span>Observação (opcional)</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></label>
        {error && <p className="error-text" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>Cancelar</button>
          <button className="btn" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </Modal>
  );
}
