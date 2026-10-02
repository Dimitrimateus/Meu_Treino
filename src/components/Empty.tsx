import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export function Empty({ icon = 'list', title, children }: { icon?: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={48} />
      <p><strong>{title}</strong></p>
      {children}
    </div>
  );
}

export function Spinner({ label = 'Carregando…' }: { label?: string }) {
  return <div className="spinner" role="status" aria-label={label} />;
}
