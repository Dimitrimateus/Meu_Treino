import { useAuth } from '../features/auth/AuthProvider';
import { usePeople, useViewedPerson } from '../lib/people';

/** "Ver: [Eu ▾ / Nome]" — só aparece para o admin. */
export function PersonPicker() {
  const { isAdmin, viewedId, setViewed } = useViewedPerson();
  if (!isAdmin) return null;
  return (
    <label className="row" style={{ marginBottom: 12 }}>
      <span className="label">Ver:</span>
      <PersonSelect value={viewedId} onChange={setViewed} />
    </label>
  );
}

export function PersonSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { userId, isAdmin } = useAuth();
  const people = usePeople(isAdmin);
  return (
    <select className="input" style={{ width: 'auto', minWidth: 160 }} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Pessoa">
      {!people.some((p) => p.id === value) && <option value={value}>{value === userId ? 'Eu' : '…'}</option>}
      {people.map((p) => <option key={p.id} value={p.id}>{p.id === userId ? `Eu (${p.name})` : p.name}</option>)}
    </select>
  );
}
