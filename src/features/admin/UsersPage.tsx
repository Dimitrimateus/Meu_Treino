import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { adminApi, type AdminUser } from '../../lib/adminApi';
import { BackLink } from '../../components/BackLink';
import { ConfirmDialog, Modal } from '../../components/Modal';
import { Empty, Spinner } from '../../components/Empty';
import { useToast } from '../../components/Toast';
import { useAuth } from '../auth/AuthProvider';

function randomPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const a = crypto.getRandomValues(new Uint32Array(12));
  return Array.from(a, (n) => chars[n % chars.length]).join('');
}

export default function UsersPage() {
  const { userId } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [resetFor, setResetFor] = useState<AdminUser | null>(null);
  const [deleteFor, setDeleteFor] = useState<AdminUser | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try { setUsers(await adminApi.list()); } catch (e) { setError((e as Error).message); setUsers([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <BackLink to="/admin" label="Admin" />
      <div className="row between">
        <h1 className="mb0">Usuários</h1>
        <button className="btn" onClick={() => setCreating(true)}>Criar conta</button>
      </div>
      <p className="muted small mt">O cadastro público é desativado: só o admin cria contas.</p>
      {error && <p className="error-text" role="alert">{error}</p>}
      {users === null ? <Spinner /> : users.length === 0 ? <Empty icon="user" title="Nenhum usuário" /> : (
        users.map((u) => (
          <div className="card" key={u.id}>
            <div className="row between">
              <div className="grow">
                <strong>{u.name}</strong> {u.role === 'admin' && <span className="badge primary">admin</span>}
                <div className="muted small ellipsis">{u.email}</div>
              </div>
            </div>
            <div className="row wrap mt">
              <button className="btn secondary sm" onClick={() => setResetFor(u)}>Redefinir senha</button>
              {u.id !== userId && (
                <>
                  <button className="btn secondary sm" onClick={async () => {
                    try { await adminApi.setRole(u.id, u.role === 'admin' ? 'user' : 'admin'); toast.show('Papel atualizado'); void load(); }
                    catch (e) { toast.show((e as Error).message); }
                  }}>{u.role === 'admin' ? 'Tornar usuário' : 'Tornar admin'}</button>
                  <button className="btn secondary sm" style={{ color: 'var(--danger)' }} onClick={() => setDeleteFor(u)}>Excluir</button>
                </>
              )}
            </div>
          </div>
        ))
      )}

      {creating && <CreateUserModal onClose={() => setCreating(false)} onCreated={() => { setCreating(false); void load(); }} />}
      {resetFor && <ResetPasswordModal user={resetFor} onClose={() => setResetFor(null)} />}
      {deleteFor && <DeleteUserFlow user={deleteFor} onClose={() => setDeleteFor(null)} onDeleted={() => { setDeleteFor(null); void load(); }} />}
    </>
  );
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(randomPassword);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError('A senha precisa ter pelo menos 8 caracteres.'); return; }
    setBusy(true); setError(null);
    try {
      await adminApi.create(name, email, password);
      toast.show('Conta criada. Envie o e-mail e a senha para a pessoa.');
      onCreated();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return (
    <Modal title="Criar conta" onClose={onClose}>
      <form onSubmit={submit}>
        <label className="field"><span>Nome</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label className="field"><span>E-mail</span><input className="input" type="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="field"><span>Senha inicial (mín. 8)</span>
          <div className="row">
            <input className="input grow" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
            <button type="button" className="btn secondary sm" onClick={() => setPassword(randomPassword())}>Gerar</button>
          </div>
        </label>
        {error && <p className="error-text" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>Cancelar</button>
          <button className="btn" disabled={busy}>{busy ? 'Criando…' : 'Criar'}</button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const toast = useToast();
  const [password, setPassword] = useState(randomPassword);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError('A senha precisa ter pelo menos 8 caracteres.'); return; }
    setBusy(true); setError(null);
    try { await adminApi.resetPassword(user.id, password); toast.show('Senha redefinida'); onClose(); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return (
    <Modal title={`Redefinir senha — ${user.name}`} onClose={onClose}>
      <form onSubmit={submit}>
        <label className="field"><span>Nova senha (mín. 8)</span>
          <div className="row">
            <input className="input grow" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
            <button type="button" className="btn secondary sm" onClick={() => setPassword(randomPassword())}>Gerar</button>
          </div>
        </label>
        {error && <p className="error-text" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>Cancelar</button>
          <button className="btn" disabled={busy}>Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

/** Exclusão com confirmação dupla. */
function DeleteUserFlow({ user, onClose, onDeleted }: { user: AdminUser; onClose: () => void; onDeleted: () => void }) {
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  if (step === 1) {
    return (
      <ConfirmDialog title="Excluir conta?" danger confirmLabel="Continuar" onCancel={onClose} onConfirm={() => setStep(2)}
        message={<p>A conta de <strong>{user.name}</strong> e <strong>todos os dados</strong> (treinos, séries, peso e fotos) serão apagados para sempre.</p>} />
    );
  }
  return (
    <Modal title="Confirmação final" onClose={onClose} actions={<>
      <button className="btn secondary" onClick={onClose}>Cancelar</button>
      <button className="btn danger" disabled={busy || typed.trim().toLowerCase() !== user.name.trim().toLowerCase()} onClick={async () => {
        setBusy(true);
        try { await adminApi.remove(user.id); toast.show('Conta excluída'); onDeleted(); }
        catch (e) { toast.show((e as Error).message); setBusy(false); }
      }}>Excluir definitivamente</button>
    </>}>
      <label className="field"><span>Digite o nome “{user.name}” para confirmar</span>
        <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} />
      </label>
    </Modal>
  );
}
