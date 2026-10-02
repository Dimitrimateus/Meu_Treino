import type { ExerciseType } from '../lib/types';
import { PR_LABEL, type PrKind } from '../lib/pr';
import { Icon } from './Icon';

export function TypeBadge({ type }: { type?: ExerciseType | null }) {
  if (!type) return null;
  return <span className="badge"><span className="dot" style={{ background: type.color }} />{type.name}</span>;
}

export function PrBadge({ kinds, compact }: { kinds?: string[] | null; compact?: boolean }) {
  if (!kinds || kinds.length === 0) return null;
  const label = kinds.map((k) => PR_LABEL[k as PrKind] ?? k).join(' · ');
  if (compact) return <span className="badge pr compact" title={`Recorde pessoal: ${label}`} aria-label={`Recorde pessoal: ${label}`}>PR</span>;
  return <span className="badge pr" title={`Recorde pessoal: ${label}`}><Icon name="trophy" size={14} />PR {label}</span>;
}
