import { Suspense, useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { APP_NAME } from '../lib/supabase';
import { applyUpdate, usePwa } from '../lib/pwa';
import { Icon, type IconName } from './Icon';
import { SyncStatus } from './SyncStatus';
import { Spinner } from './Empty';

const TABS: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Semana', icon: 'home', end: true },
  { to: '/progresso', label: 'Progresso', icon: 'chart' },
  { to: '/peso', label: 'Peso', icon: 'scale' },
  { to: '/perfil', label: 'Perfil', icon: 'user' },
];

export function Layout() {
  const { isAdmin } = useAuth();
  const { needRefresh } = usePwa();
  const loc = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  const tabs = isAdmin ? [...TABS, { to: '/admin', label: 'Admin', icon: 'shield' as IconName }] : TABS;
  return (
    <div className="app">
      <nav className="tabbar" aria-label="Navegação principal">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end}>
            <Icon name={t.icon} />
            <span>{t.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="app-col">
        <header className="topbar">
          <Link to="/" className="brand">{APP_NAME}</Link>
          <SyncStatus />
        </header>
        <main className="main" id="conteudo">
          {needRefresh && (
            <div className="banner row between" role="alert">
              <span>Nova versão disponível.</span>
              <button className="btn sm" onClick={() => void applyUpdate()}>Atualizar</button>
            </div>
          )}
          <Suspense fallback={<Spinner />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
