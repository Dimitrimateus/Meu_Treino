import { Link } from 'react-router-dom';
import { Icon } from './Icon';

export function BackLink({ to, label = 'Voltar' }: { to: string; label?: string }) {
  return (
    <Link to={to} className="btn ghost sm" style={{ marginLeft: -12, marginBottom: 8 }}>
      <Icon name="left" size={18} />{label}
    </Link>
  );
}
