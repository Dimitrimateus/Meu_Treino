import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { TypeBadge } from '../../components/Badge';
import { Empty, Spinner } from '../../components/Empty';
import { Icon } from '../../components/Icon';
import { useExercises, useTypes } from './useCatalog';

export function normalizeSearch(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export default function LibraryPage() {
  const { rows: exercises, error } = useExercises();
  const { rows: types } = useTypes();
  const [q, setQ] = useState('');
  const [typeId, setTypeId] = useState('');
  const typeMap = useMemo(() => new Map((types ?? []).map((t) => [t.id, t])), [types]);
  const filtered = (exercises ?? []).filter((e) =>
    (!typeId || e.type_id === typeId) && (!q || normalizeSearch(e.name).includes(normalizeSearch(q))));
  return (
    <>
      <BackLink to="/admin" label="Admin" />
      <div className="row between">
        <h1 className="mb0">Exercícios</h1>
        <Link className="btn" to="/admin/exercicios/novo">Novo exercício</Link>
      </div>
      <div className="row mt">
        <input className="input grow" type="search" placeholder="Buscar…" aria-label="Buscar exercício" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" style={{ width: 'auto' }} aria-label="Filtrar por tipo" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
          <option value="">Todos os tipos</option>
          {(types ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      {error && <p className="error-text mt" role="alert">{error}</p>}
      {exercises === null ? <Spinner /> : filtered.length === 0 ? (
        <Empty icon="dumbbell" title={exercises.length ? 'Nada encontrado' : 'Nenhum exercício ainda'}>
          {!exercises.length && <Link className="btn" to="/admin/exercicios/novo">Cadastrar o primeiro</Link>}
        </Empty>
      ) : (
        <div className="mt">
          {filtered.map((e) => (
            <Link key={e.id} to={`/admin/exercicios/${e.id}`} className="card card-link row">
              <div className="grow">
                <strong>{e.name}</strong>
                <div><TypeBadge type={e.type_id ? typeMap.get(e.type_id) : null} /></div>
              </div>
              <Icon name="right" size={18} />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
