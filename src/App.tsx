import { AuthProvider } from './features/auth/AuthProvider';
import { ToastProvider } from './components/Toast';
import { AppRoutes } from './routes';
import { isSupabaseConfigured } from './lib/supabase';
import { SetupNeeded } from './features/auth/SetupNeeded';

export function App() {
  if (!isSupabaseConfigured) return <SetupNeeded />;
  return (
    <ToastProvider>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </ToastProvider>
  );
}
