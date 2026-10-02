export function SetupNeeded() {
  return (
    <main className="main" style={{ maxWidth: 560 }}>
      <h1>Configuração pendente</h1>
      <p>As variáveis <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> não foram definidas.</p>
      <p className="muted">Copie <code>.env.example</code> para <code>.env</code> e preencha com os dados do projeto Supabase (veja o README).</p>
    </main>
  );
}
