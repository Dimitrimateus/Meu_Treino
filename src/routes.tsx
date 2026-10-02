import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './features/auth/AuthProvider';
import { Layout } from './components/Layout';
import { Spinner } from './components/Empty';
import LoginPage from './features/auth/LoginPage';
import WeekPage from './features/week/WeekPage';

const DayPage = lazy(() => import('./features/day/DayPage'));
const ExercisePage = lazy(() => import('./features/exercise/ExercisePage'));
const SessionSummaryPage = lazy(() => import('./features/session/SessionSummaryPage'));
const ProgressPage = lazy(() => import('./features/progress/ProgressPage'));
const WeightPage = lazy(() => import('./features/weight/WeightPage'));
const ProfilePage = lazy(() => import('./features/profile/ProfilePage'));
const AdminRoutes = lazy(() => import('./features/admin/AdminRoutes'));

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner />;
  if (!session) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function AppRoutes() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          <Route index element={<WeekPage />} />
          <Route path="dia/:weekday" element={<DayPage />} />
          <Route path="dia/:weekday/ex/:id" element={<ExercisePage />} />
          <Route path="sessao/:id" element={<SessionSummaryPage />} />
          <Route path="progresso" element={<ProgressPage />} />
          <Route path="peso" element={<WeightPage />} />
          <Route path="perfil" element={<ProfilePage />} />
          <Route path="admin/*" element={<RequireAdmin><AdminRoutes /></RequireAdmin>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
