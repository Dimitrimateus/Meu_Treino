import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { APP_NAME } from '../../lib/supabase';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';

export default function LoginPage() {
  const { session, signIn, loading } = useAuth();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);

  if (!loading && session) return <Navigate to={loc.state?.from ?? '/'} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email || !password) { setError('Informe e-mail e senha.'); return; }
    setBusy(true);
    const err = await signIn(email, password);
    setBusy(false);
    if (err) setError(err);
    else nav(loc.state?.from ?? '/', { replace: true });
  }

  return (
    <main className="main" style={{ maxWidth: 420, paddingTop: 'calc(env(safe-area-inset-top) + 48px)' }}>
      <div className="center" style={{ marginBottom: 24 }}>
        <img src="/icons/icon-192.png" alt="" width={72} height={72} style={{ margin: '0 auto 12px', borderRadius: 16 }} />
        <h1>{APP_NAME}</h1>
        <p className="muted">Entre com a conta criada pelo admin.</p>
      </div>
      <form className="card" onSubmit={submit} noValidate>
        <label className="field">
          <span>E-mail</span>
          <input className="input" type="email" autoComplete="username" inputMode="email" autoCapitalize="none"
            value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field">
          <span>Senha</span>
          <div className="row">
            <input className="input grow" type={show ? 'text' : 'password'} autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)} required />
            <button type="button" className="btn ghost icon-btn" onClick={() => setShow((s) => !s)}
              aria-label={show ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={show}>
              <Icon name={show ? 'eyeOff' : 'eye'} />
            </button>
          </div>
        </label>
        {error && <p className="error-text" role="alert">{error}</p>}
        <button className="btn block lg" type="submit" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
        <button type="button" className="btn ghost block mt" onClick={() => setForgot(true)}>Esqueci minha senha</button>
      </form>
      {forgot && (
        <Modal title="Esqueci minha senha" onClose={() => setForgot(false)}
          actions={<button className="btn" onClick={() => setForgot(false)}>Entendi</button>}>
          <p>As contas são gerenciadas pelo admin. Peça ao admin para redefinir sua senha em <strong>Admin → Usuários</strong>.</p>
        </Modal>
      )}
    </main>
  );
}
