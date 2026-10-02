// Edge Function: gestão de contas (somente admin).
// POST { action: 'list' | 'create' | 'reset_password' | 'delete' | 'set_role', ... }
// A service_role fica só aqui (injetada pelo Supabase como SUPABASE_SERVICE_ROLE_KEY).
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  // 1) valida o JWT do chamador e confirma role = 'admin'
  const authHeader = req.headers.get('Authorization') ?? '';
  const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await caller.auth.getUser();
  if (userErr || !userData.user) return json({ error: 'Não autenticado' }, 401);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: me } = await admin.from('profiles').select('role').eq('id', userData.user.id).maybeSingle();
  if (me?.role !== 'admin') return json({ error: 'Acesso restrito ao admin' }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
  const action = String(body.action ?? '');

  try {
    switch (action) {
      case 'list': {
        const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
        if (error) throw error;
        const { data: profiles } = await admin.from('profiles').select('*').order('name');
        const emails = new Map(data.users.map((u) => [u.id, { email: u.email, last_sign_in_at: u.last_sign_in_at }]));
        return json({ users: (profiles ?? []).map((p) => ({ ...p, ...emails.get(p.id) })) });
      }
      case 'create': {
        const email = String(body.email ?? '').trim().toLowerCase();
        const password = String(body.password ?? '');
        const name = String(body.name ?? '').trim();
        if (!email || !name) return json({ error: 'Informe nome e e-mail' }, 400);
        if (password.length < 8) return json({ error: 'A senha precisa ter pelo menos 8 caracteres' }, 400);
        const { data, error } = await admin.auth.admin.createUser({
          email, password, email_confirm: true, user_metadata: { name },
        });
        if (error) {
          const msg = /already|registered|exists/i.test(error.message) ? 'Já existe uma conta com este e-mail' : error.message;
          return json({ error: msg }, 400);
        }
        // o trigger handle_new_user cria o perfil e os 7 dias de descanso
        return json({ ok: true, id: data.user?.id });
      }
      case 'reset_password': {
        const id = String(body.user_id ?? '');
        const password = String(body.password ?? '');
        if (password.length < 8) return json({ error: 'A senha precisa ter pelo menos 8 caracteres' }, 400);
        const { error } = await admin.auth.admin.updateUserById(id, { password });
        if (error) throw error;
        return json({ ok: true });
      }
      case 'set_role': {
        const id = String(body.user_id ?? '');
        const role = body.role === 'admin' ? 'admin' : 'user';
        if (id === userData.user.id && role !== 'admin') return json({ error: 'Você não pode remover o próprio acesso de admin' }, 400);
        const { error } = await admin.from('profiles').update({ role }).eq('id', id);
        if (error) throw error;
        return json({ ok: true });
      }
      case 'delete': {
        const id = String(body.user_id ?? '');
        if (!id) return json({ error: 'user_id obrigatório' }, 400);
        if (id === userData.user.id) return json({ error: 'Você não pode excluir a própria conta' }, 400);
        // remove a pasta de fotos no Storage
        const bucket = admin.storage.from('progress-photos');
        for (let i = 0; i < 20; i++) {
          const { data: files } = await bucket.list(id, { limit: 1000 });
          if (!files || files.length === 0) break;
          await bucket.remove(files.map((f) => `${id}/${f.name}`));
        }
        const { error } = await admin.auth.admin.deleteUser(id);
        if (error) throw error;
        return json({ ok: true });
      }
      default:
        return json({ error: 'Ação desconhecida' }, 400);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
