import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../../components/Icon';
import { usePeople } from '../../lib/people';
import { useAuth } from '../auth/AuthProvider';

const ITEMS: { to: string; title: string; desc: string; icon: IconName }[] = [
  { to: '/admin/treino', title: 'Editor de treino', desc: 'Montar a semana de cada pessoa', icon: 'calendar' },
  { to: '/admin/exercicios', title: 'Biblioteca de exercícios', desc: 'Nome, tipo, descrição, fotos e GIFs', icon: 'dumbbell' },
  { to: '/admin/tipos', title: 'Tipos de exercício', desc: 'Grupos musculares e cores', icon: 'list' },
  { to: '/admin/usuarios', title: 'Usuários', desc: 'Criar contas, redefinir senha, excluir', icon: 'user' },
  { to: '/admin/exportar', title: 'Exportar dados', desc: 'Backup manual em JSON ou CSV', icon: 'download' },
];

export default function AdminHome() {
  const { isAdmin, userId } = useAuth();
  const people = usePeople(isAdmin);
  return (
    <>
      <h1>Admin</h1>
      {ITEMS.map((it) => (
        <Link key={it.to} to={it.to} className="card card-link row">
          <Icon name={it.icon} />
          <div className="grow">
            <strong>{it.title}</strong>
            <div className="muted small">{it.desc}</div>
          </div>
          <Icon name="right" size={18} />
        </Link>
      ))}
      <h2 className="section-title">Ver dados da pessoa</h2>
      {people.filter((p) => p.id !== userId).map((p) => (
        <div className="card" key={p.id}>
          <strong>{p.name}</strong>
          <div className="row wrap mt">
            <Link className="btn secondary sm" to={`/admin/treino/${p.id}`}>Treino</Link>
            <Link className="btn secondary sm" to={`/progresso?u=${p.id}`}>Progresso e histórico</Link>
            <Link className="btn secondary sm" to={`/peso?u=${p.id}`}>Peso</Link>
            <Link className="btn secondary sm" to={`/peso?u=${p.id}&aba=fotos`}>Fotos</Link>
          </div>
        </div>
      ))}
      {people.length <= 1 && <p className="muted small">Crie contas em Usuários para ver os dados de outras pessoas.</p>}
    </>
  );
}
