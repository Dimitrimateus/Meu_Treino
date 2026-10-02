# App de Treinos (PWA) — Documentação do Projeto

> Documento de referência único para construir o projeto inteiro. Escrito em pt-BR. Tudo aqui já foi decidido com o dono do projeto (Dimitri, "admin"). Onde há "Padrão assumido", foi uma sugestão aceita sem objeção.

---

## 0. Como usar este documento (instruções para o Claude Code)

1. Leia este arquivo inteiro antes de escrever código.
2. O dono quer o projeto **construído de uma vez**. As fases da seção 16 definem a **ordem de trabalho**, não pontos de parada. Não peça confirmação entre fases: faça um commit por fase e continue.
3. Execute de forma autônoma. Quando algo for ambíguo, escolha o padrão mais simples e coerente com este documento e **registre a escolha** em `DECISOES.md`. Sinalize ressalvas só no final.
4. Tudo que exige ação humana (criar conta no Supabase, rodar comandos com credenciais, configurar Cloudflare) deve ficar descrito passo a passo no `README.md` (conteúdo base na seção 18).
5. Nunca coloque chaves secretas no front-end nem no repositório. Só a `anon key` (pública, protegida por RLS) vai para o cliente.
6. Interface e textos 100% em **português do Brasil**.
7. Antes de dar uma fase por concluída, rode testes e o build, e confira o checklist da fase.

---

## 1. Visão geral

App de acompanhamento de treinos de musculação para **duas pessoas** (o admin e a namorada, "usuária"), com possibilidade de poucos usuários a mais no futuro.

- Funciona no **navegador** (PC e celular) e como **app instalável** (PWA). A usuária usa **iPhone** (Safari → Compartilhar → Adicionar à Tela de Início).
- **Sincronizado** entre PC e celular via Supabase.
- **Funciona sem internet** na academia (dados locais + fila de sincronização).
- Visual leve, responsivo, cores sólidas, **azul como cor base**, sem gradientes.

### Objetivos

- Ver a semana, tocar no dia e ver os exercícios.
- Registrar por série: repetições e carga (kg, com decimais).
- Ver os últimos registros de cada exercício ao lado do registro atual.
- Marcar exercícios concluídos e finalizar o treino, com duração e log de horários.
- Destacar recordes pessoais (PR).
- Gráficos de evolução, calendário de treinos, peso corporal e fotos de evolução.
- Lembrete de treino 1 h antes e aviso quando o admin alterar o treino.
- Admin edita tudo do treino de qualquer usuário e vê todos os dados.

### Fora do escopo (por agora)

- Vídeos (nem upload nem link).
- Cronômetro/sistema de descanso. O **tempo de descanso** existe só como informação exibida no exercício.
- Cadastro aberto (auto-registro).
- Comentários/chat entre usuários.
- Mais de um treino no mesmo dia.
- Outras unidades de peso (só kg). Outros idiomas (só pt-BR).
- Exportação Excel/PDF e backup automático: **opcional** (ver fase 8).

---

## 2. Decisões fechadas

| Tema | Decisão |
|---|---|
| Login | E-mail e senha. Sem cadastro aberto: **o admin cria as contas** |
| Papéis | `admin` e `user`. Admin também treina no app |
| Usuários | Poucos (2 agora) |
| Semana | O admin monta a semana como quiser: quais dias têm treino e quais são descanso |
| Treinos por dia | 1 por dia (treino ou descanso) |
| Tipos de exercício | Admin cadastra tipos (grupos musculares etc.) e escolhe o tipo ao criar cada exercício |
| Descrição do exercício | Texto + fotos + GIFs. **Sem vídeo** |
| Série | Repetições + carga em kg, **decimais** (ex.: 12,5) |
| Descanso | Campo informativo por exercício; **sem timer** |
| Conclusão | Marcar exercício concluído e finalizar treino. Mostrar duração total |
| Logs | Registrar horário do primeiro check, de cada exercício concluído e do fim do treino |
| PR | Destacar recordes pessoais |
| Progresso | Gráficos (carga, volume, peso corporal, frequência), calendário com sequência |
| Peso corporal | Registro próprio com gráfico |
| Fotos | Opcionais, mas **toda foto exige um peso**. Admin vê todas. **Sem aviso** à usuária de que o admin vê |
| Treino pulado | Usuária marca "Não treinei hoje" (motivo opcional); aparece no calendário |
| Notificações | Lembrete **1 h antes** do treino + aviso imediato (com agrupamento) quando o admin alterar o treino |
| Hospedagem | Gratuita: Supabase (backend) + Cloudflare Pages ou GitHub Pages (site) |
| Visual | Azul como base, tema claro/escuro automático, cores sólidas, sem gradientes |

**Padrão assumido:** horário do treino por dia da semana definido pelo admin (editável também pela própria pessoa em Perfil); antecedência do lembrete = 60 min (configurável em Perfil).

---

## 3. Stack

| Camada | Escolha |
|---|---|
| Front-end | React 18 + TypeScript + Vite |
| Rotas | React Router (modo SPA) |
| Dados locais | Dexie (IndexedDB) + `dexie-react-hooks` (`useLiveQuery`) como fonte de dados da UI |
| Backend | Supabase: Postgres, Auth, Storage, Realtime, Edge Functions, pg_cron, pg_net |
| Estilos | CSS puro com variáveis (CSS Modules). **Sem** biblioteca de UI pesada |
| Gráficos | Chart.js (carregado sob demanda, `lazy`) |
| PWA | `vite-plugin-pwa` com estratégia `injectManifest` (service worker próprio, necessário para push) |
| Testes | Vitest (lógica), scripts SQL/pgTAP (RLS), Playwright (smoke, opcional) |
| Hospedagem | Cloudflare Pages (preferencial) ou GitHub Pages |

Metas de desempenho: bundle inicial < 250 KB gzip, code-splitting por rota, gráficos e editor admin em chunks separados, Lighthouse PWA/Performance/Acessibilidade ≥ 90.

---

## 4. Arquitetura

```
 iPhone (PWA)            PC (navegador/PWA)
 ┌───────────────┐       ┌───────────────┐
 │ UI React      │       │ UI React      │
 │ Dexie (local) │       │ Dexie (local) │
 │ Fila (outbox) │       │ Fila (outbox) │
 └──────┬────────┘       └──────┬────────┘
        │ sync (push/pull)      │
        ▼                       ▼
 ┌───────────────────────────────────────┐
 │ Supabase                              │
 │  Auth · Postgres (RLS) · Storage      │
 │  Realtime · Edge Functions · pg_cron  │
 └───────────────────────────────────────┘
        │ Web Push (VAPID)
        ▼
  Notificações no iPhone/PC
```

Princípios:

- **Local-first para o uso diário**: a UI lê e escreve no Dexie; um motor de sincronização conversa com o Supabase.
- **Servidor é a fonte da verdade** para dados do admin (treinos, exercícios, tipos).
- **Dados da usuária** (sessões, séries, peso, fotos) nascem no aparelho e sobem pela fila. Escrita é idempotente (UUID gerado no cliente).
- **Editor do admin é online-only** (escreve direto no Supabase). Evita conflitos e simplifica.
- Admin vendo dados de **outra** pessoa: leitura online direto do Supabase (sem cache local obrigatório).

---

## 5. Perfis e permissões

| Recurso | Usuária (`user`) | Admin (`admin`) |
|---|---|---|
| Próprio perfil (nome, fuso, lembretes) | Ler/editar (exceto `role`) | Ler/editar todos |
| Criar/redefinir senha/excluir contas | Não | Sim (via Edge Function) |
| Tipos de exercício, exercícios, mídias | Somente leitura | Criar/editar/excluir |
| Treino semanal (dias e exercícios) | Somente leitura do próprio | Criar/editar/excluir de **qualquer** usuário (inclusive o próprio) |
| Sessões, séries, eventos, conclusões | Criar/editar/excluir as próprias | **Ler** de todos |
| Peso corporal | CRUD do próprio | Ler de todos |
| Fotos de evolução | CRUD das próprias | **Ler** de todos |
| Inscrições push | Só as próprias | — (Edge Functions usam service role) |
| Notificações (caixa interna) | Ler/marcar lida as próprias | — |

O admin é também usuário: tem o próprio treino, registros, peso e fotos como qualquer pessoa. Em telas de Progresso, Peso, Fotos e Histórico, o admin tem um seletor **"Ver: [Eu ▾ / Nome]"** no topo.

---

## 6. Modelo de dados (Postgres)

### 6.1 Convenções

- Todas as tabelas sincronizadas têm: `id uuid` (gerado no cliente quando é dado da usuária), `created_at`, `updated_at` (mantido por trigger, sempre hora do servidor) e `deleted_at` (**exclusão lógica**, para a exclusão se propagar a outros aparelhos).
- Sync incremental por `updated_at`.
- Datas de calendário (`session_date`, `measured_on`, `taken_on`) são a **data local** do usuário (fuso do perfil, padrão `America/Recife`).
- Dias da semana: ISO, `1 = segunda … 7 = domingo`.

### 6.2 SQL (`supabase/migrations/0001_schema.sql`)

```sql
-- ============ TIPOS ============
create type app_role as enum ('admin', 'user');
create type session_status as enum ('in_progress', 'finished', 'skipped');

-- ============ FUNÇÕES BASE ============
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ============ PERFIS ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role app_role not null default 'user',
  timezone text not null default 'America/Recife',
  reminders_enabled boolean not null default true,
  reminder_lead_minutes int not null default 60
    check (reminder_lead_minutes between 0 and 720),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- impede usuário comum de se promover a admin
create or replace function public.prevent_role_change() returns trigger
language plpgsql as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Somente admin pode alterar o papel';
  end if;
  return new;
end $$;
create trigger profiles_role_guard before update on public.profiles
  for each row execute function public.prevent_role_change();
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ============ CATÁLOGO (global, gerido pelo admin) ============
create table public.exercise_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#2563EB',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index exercise_types_name_uq on public.exercise_types (lower(name)) where deleted_at is null;

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type_id uuid references public.exercise_types(id),
  description text,                      -- como executar (texto)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index exercises_type_idx on public.exercises (type_id);

create table public.exercise_media (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  storage_path text not null,            -- bucket exercise-media
  kind text not null check (kind in ('image', 'gif')),
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ============ TREINO SEMANAL (por usuário) ============
create table public.routine_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  is_rest boolean not null default true,
  title text,                            -- ex.: "Peito e Tríceps"
  scheduled_time time,                   -- horário local do treino (base do lembrete)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, weekday)
);

create table public.routine_exercises (
  id uuid primary key default gen_random_uuid(),
  routine_day_id uuid not null references public.routine_days(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade, -- copiado do dia (trigger)
  exercise_id uuid not null references public.exercises(id),
  position int not null default 0,
  target_sets int not null default 3 check (target_sets > 0),
  target_reps text,                      -- "12" ou "8-12"
  target_weight_kg numeric(6,2) check (target_weight_kg >= 0),
  rest_seconds int check (rest_seconds >= 0),  -- só informativo
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index routine_exercises_day_idx on public.routine_exercises (routine_day_id, position);

create or replace function public.routine_exercise_sync_user() returns trigger
language plpgsql as $$
begin
  select user_id into new.user_id from public.routine_days where id = new.routine_day_id;
  return new;
end $$;
create trigger routine_exercises_user before insert or update on public.routine_exercises
  for each row execute function public.routine_exercise_sync_user();

-- ============ EXECUÇÃO (dados da pessoa) ============
create table public.workout_sessions (
  id uuid primary key,                   -- gerado no cliente
  user_id uuid not null references public.profiles(id) on delete cascade,
  routine_day_id uuid references public.routine_days(id) on delete set null,
  session_date date not null,
  title_snapshot text,
  status session_status not null default 'in_progress',
  started_at timestamptz,                -- 1º check/1ª série
  finished_at timestamptz,
  duration_seconds int check (duration_seconds >= 0),
  skip_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index workout_sessions_day_uq on public.workout_sessions (user_id, session_date) where deleted_at is null;

create table public.session_exercises (
  id uuid primary key,
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  routine_exercise_id uuid references public.routine_exercises(id) on delete set null,
  exercise_id uuid not null references public.exercises(id),
  exercise_name_snapshot text not null,
  position int not null default 0,
  target_sets int, target_reps text, target_weight_kg numeric(6,2), rest_seconds int,
  completed_at timestamptz,              -- horário do check de conclusão
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.set_logs (
  id uuid primary key,
  session_exercise_id uuid not null references public.session_exercises(id) on delete cascade,
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id),
  set_number int not null check (set_number > 0),
  reps int not null check (reps >= 0),
  weight_kg numeric(6,2) not null check (weight_kg >= 0),
  logged_at timestamptz not null,        -- horário do cliente (pode ser offline)
  is_pr boolean not null default false,
  pr_kinds text[] not null default '{}', -- 'weight' | 'e1rm' | 'reps'
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index set_logs_hist_idx on public.set_logs (user_id, exercise_id, logged_at desc) where deleted_at is null;

-- log de eventos (append-only) — "log do primeiro check, das conclusões e do fim do treino"
create table public.session_events (
  id uuid primary key,
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_exercise_id uuid references public.session_exercises(id) on delete set null,
  kind text not null check (kind in (
    'session_started','set_logged','exercise_completed','exercise_uncompleted',
    'session_finished','session_reopened','session_skipped')),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index session_events_session_idx on public.session_events (session_id, occurred_at);

-- ============ CORPO ============
create table public.body_weight_logs (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  measured_on date not null,
  weight_kg numeric(5,2) not null check (weight_kg between 20 and 400),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index body_weight_day_uq on public.body_weight_logs (user_id, measured_on) where deleted_at is null;

create table public.progress_photos (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body_weight_log_id uuid not null references public.body_weight_logs(id) on delete cascade, -- foto exige peso
  taken_on date not null,
  storage_path text not null,            -- bucket progress-photos: {user_id}/{uuid}.jpg
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ============ NOTIFICAÇÕES ============
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table public.notifications (      -- caixa interna + deduplicação
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('workout_reminder','routine_changed')),
  title text not null,
  body text,
  url text default '/',
  dedupe_key text,                       -- ex.: '2026-10-01' para lembrete do dia
  created_at timestamptz not null default now(),
  read_at timestamptz,
  push_sent_at timestamptz
);
create unique index notifications_dedupe_uq on public.notifications (user_id, kind, dedupe_key) where dedupe_key is not null;

create table public.routine_change_events (  -- alimenta o aviso "treino alterado" (agrupado)
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade, -- dono do treino alterado
  changed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
```

### 6.3 Triggers adicionais (`0002_triggers.sql`)

```sql
-- updated_at em todas as tabelas sincronizadas
do $$ declare t text; begin
  foreach t in array array[
    'exercise_types','exercises','exercise_media','routine_days','routine_exercises',
    'workout_sessions','session_exercises','set_logs','session_events',
    'body_weight_logs','progress_photos'] loop
    execute format('create trigger %I before insert or update on public.%I
      for each row execute function public.touch_updated_at()', t||'_touch', t);
  end loop;
end $$;

-- novo usuário (criado pelo admin via Edge Function) => perfil + 7 dias de descanso
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare d int;
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)));
  for d in 1..7 loop
    insert into public.routine_days (user_id, weekday, is_rest) values (new.id, d, true);
  end loop;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- recordes pessoais (PR) — ver regras na seção 8.5
create or replace function public.compute_pr() returns trigger
language plpgsql as $$
declare
  prev_cnt int; prev_w numeric; prev_e1 numeric; prev_reps int;
  e1 numeric; kinds text[] := '{}';
begin
  if new.deleted_at is not null then return new; end if;
  e1 := case when new.reps <= 1 then new.weight_kg
             else new.weight_kg * (1 + least(new.reps, 12) / 30.0) end;
  select count(*), max(weight_kg),
         max(case when reps <= 1 then weight_kg else weight_kg * (1 + least(reps,12)/30.0) end),
         max(reps) filter (where weight_kg = 0)
    into prev_cnt, prev_w, prev_e1, prev_reps
    from public.set_logs
   where user_id = new.user_id and exercise_id = new.exercise_id
     and deleted_at is null and id <> new.id and logged_at < new.logged_at;
  if prev_cnt > 0 then           -- primeiro registro da história nunca é PR
    if new.weight_kg > 0 then
      if new.weight_kg > prev_w then kinds := kinds || 'weight'; end if;
      if e1 > coalesce(prev_e1, 0) then kinds := kinds || 'e1rm'; end if;
    elsif new.reps > coalesce(prev_reps, 0) then
      kinds := kinds || 'reps';
    end if;
  end if;
  new.pr_kinds := kinds;
  new.is_pr := cardinality(kinds) > 0;
  return new;
end $$;
create trigger set_logs_pr before insert or update of reps, weight_kg, logged_at, deleted_at
  on public.set_logs for each row execute function public.compute_pr();

-- eventos de alteração de treino (só quando o admin altera treino de OUTRA pessoa)
create or replace function public.log_routine_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  owner := coalesce(new.user_id, old.user_id);
  if auth.uid() is not null and owner <> auth.uid() then
    insert into public.routine_change_events (user_id, changed_by) values (owner, auth.uid());
  end if;
  return coalesce(new, old);
end $$;
create trigger routine_days_change after insert or update or delete on public.routine_days
  for each row execute function public.log_routine_change();
create trigger routine_exercises_change after insert or update or delete on public.routine_exercises
  for each row execute function public.log_routine_change();
```

---

## 7. Segurança: RLS e Storage (`0003_rls.sql`)

```sql
alter table public.profiles enable row level security;
alter table public.exercise_types enable row level security;
alter table public.exercises enable row level security;
alter table public.exercise_media enable row level security;
alter table public.routine_days enable row level security;
alter table public.routine_exercises enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.session_exercises enable row level security;
alter table public.set_logs enable row level security;
alter table public.session_events enable row level security;
alter table public.body_weight_logs enable row level security;
alter table public.progress_photos enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notifications enable row level security;
alter table public.routine_change_events enable row level security; -- sem policies: só service role

-- perfis
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.is_admin());

-- catálogo: todos leem, só admin escreve
do $$ declare t text; begin
  foreach t in array array['exercise_types','exercises','exercise_media'] loop
    execute format('create policy %I on public.%I for select to authenticated using (true)', t||'_read', t);
    execute format('create policy %I on public.%I for all to authenticated
      using (public.is_admin()) with check (public.is_admin())', t||'_admin', t);
  end loop;
end $$;

-- treino semanal: dono lê, admin lê/escreve
do $$ declare t text; begin
  foreach t in array array['routine_days','routine_exercises'] loop
    execute format('create policy %I on public.%I for select to authenticated
      using (user_id = auth.uid() or public.is_admin())', t||'_read', t);
    execute format('create policy %I on public.%I for all to authenticated
      using (public.is_admin()) with check (public.is_admin())', t||'_admin', t);
  end loop;
end $$;

-- dados da pessoa: dono CRUD, admin só lê
do $$ declare t text; begin
  foreach t in array array['workout_sessions','session_exercises','set_logs','session_events',
                           'body_weight_logs','progress_photos','notifications'] loop
    execute format('create policy %I on public.%I for all to authenticated
      using (user_id = auth.uid()) with check (user_id = auth.uid())', t||'_owner', t);
    execute format('create policy %I on public.%I for select to authenticated
      using (public.is_admin())', t||'_admin_read', t);
  end loop;
end $$;

create policy push_owner on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
```

### Storage

```sql
insert into storage.buckets (id, name, public) values
  ('progress-photos', 'progress-photos', false),   -- privado
  ('exercise-media',  'exercise-media',  true)     -- leitura pública (URLs com UUID)
on conflict (id) do nothing;

-- fotos de evolução: pasta = id do usuário
create policy photos_owner on storage.objects for all to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy photos_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'progress-photos' and public.is_admin());

-- mídia de exercícios: só admin escreve
create policy exmedia_admin_write on storage.objects for all to authenticated
  using (bucket_id = 'exercise-media' and public.is_admin())
  with check (bucket_id = 'exercise-media' and public.is_admin());
```

Regras de segurança adicionais:

- **Desativar cadastro público** no Supabase (Authentication → Sign In / Providers → desmarcar "Allow new users to sign up").
- Senha mínima de 8 caracteres.
- `service_role` só dentro das Edge Functions (secrets). Nunca no front-end.
- Fotos privadas: exibir com **URL assinada** (`createSignedUrl`, validade curta, ex.: 1 h).
- Testar RLS com duas contas (ver seção 17).

---

## 8. Regras de negócio

### 8.1 Semana e treino do dia

- Cada usuário tem 7 linhas em `routine_days` (criadas no cadastro, todas descanso).
- O admin marca cada dia como **treino** (com título e horário opcional) ou **descanso**, e adiciona exercícios aos dias de treino.
- "Hoje" é calculado pela data local no fuso do perfil.
- Semana começa na **segunda**; o dia de hoje é destacado.

### 8.2 Sessão de treino

- Uma sessão por usuário por dia (`unique(user_id, session_date)`).
- A sessão é **criada no primeiro uso** do treino do dia: ao registrar a primeira série **ou** marcar o primeiro exercício (o que vier primeiro). Nesse momento:
  - `started_at = agora` e evento `session_started`.
  - Copiam-se os exercícios do treino para `session_exercises` como **snapshot** (nome, meta de séries/reps/kg/descanso), para que alterações futuras do admin não reescrevam o histórico.
- **Mudança do admin durante um treino em andamento:** a sessão do dia não muda; o app exibe aviso "O treino foi atualizado. Aplicar mudanças?" e, se aceito, reconcilia adicionando exercícios novos e marcando removidos (sem apagar séries já registradas).
- **Concluir exercício:** define `completed_at = agora` e evento `exercise_completed`. Desmarcar limpa `completed_at` e gera `exercise_uncompleted`. O app **sugere** concluir quando o número de séries registradas atinge a meta (não conclui sozinho).
- **Finalizar treino:** `finished_at = agora`, `status = finished`, `duration_seconds = finished_at - started_at` e evento `session_finished`. Exibe uma tela de resumo com duração, exercícios concluídos, volume total e PRs do dia.
- Se houver exercícios não concluídos, pedir confirmação ("Finalizar mesmo assim?").
- **Reabrir treino** (caso finalizou sem querer): `status = in_progress`, limpa `finished_at`/`duration_seconds`, evento `session_reopened`.
- Sessão esquecida aberta: não finalizar automaticamente. No calendário aparece como "incompleto" e sem duração.

### 8.3 "Não treinei hoje"

- Cria/atualiza a sessão do dia com `status = skipped`, `skip_reason` opcional e evento `session_skipped`.
- Aparece no calendário (cor neutra/ícone próprio) e **quebra a sequência** (seção 8.6).
- Dá para desfazer (vira `in_progress` ao registrar algo).

### 8.4 Séries

- Série = `set_number`, `reps`, `weight_kg`, `logged_at`.
- **Pré-preenchimento:** cada linha de série vem com a carga/reps da **mesma série da última sessão** daquele exercício; se não houver histórico, vem da meta do treino.
- Permitir **adicionar** séries além da meta e **remover** série (com desfazer).
- Peso aceita vírgula ou ponto: `12,5` e `12.5` → `12.5`. Máximo 2 casas decimais. Exibir sempre com vírgula (pt-BR): `12,5 kg`.
- `weight_kg = 0` é válido (exercício com peso do corpo).
- Observação opcional por série (campo `note`).

### 8.5 Recordes pessoais (PR)

Calculados no servidor (trigger `compute_pr`) e também de forma provisória no cliente (mesma função pura, testada, para exibir na hora, inclusive offline). Por usuário e por exercício:

| Tipo | Regra |
|---|---|
| `weight` | Carga maior que qualquer carga anterior |
| `e1rm` | 1RM estimado maior que qualquer anterior. Fórmula de Epley: `peso × (1 + min(reps,12)/30)`; se `reps ≤ 1`, é o próprio peso |
| `reps` | Só quando `weight = 0`: mais repetições que qualquer registro anterior sem carga |

- O **primeiro registro da história** de um exercício não é PR (evita troféu em tudo no começo).
- Série que bate recorde mostra selo dourado "PR" (com o tipo). Na tela de resumo: lista de PRs do treino.
- Na tela do exercício: "Seus recordes" (maior carga, melhor 1RM estimado, melhor volume numa série) com data.

### 8.6 Sequência (streak) e calendário

- **Dia treinado** = sessão `finished`.
- **Sequência** = quantidade de treinos planejados consecutivos concluídos. Dias de descanso não quebram. Um dia planejado **passado** sem sessão finalizada, ou marcado "não treinei", **quebra**. O dia de hoje ainda não quebra enquanto o dia não acabou.
- Calendário mensal: dia treinado (azul cheio), pulado (cinza com traço), incompleto (azul vazado), descanso (sem marca), hoje (contorno). Tocar no dia abre o resumo da sessão (séries, horários, duração).

### 8.7 Peso corporal e fotos

- Um registro de peso por dia (upsert). Decimais com 1–2 casas.
- **Foto exige peso:** o fluxo "Adicionar foto" pede o peso do dia (pré-preenche se já houver registro de hoje) e só então salva a foto, vinculada a `body_weight_log_id`.
- Foto é opcional; o peso sozinho é suficiente.
- Compressão no cliente antes do upload: lado maior 1600 px, JPEG/WebP qualidade ~0,8, corrigindo orientação EXIF. Meta: < 400 KB por foto.
- Comparativo: escolher duas fotos e ver lado a lado com os pesos e datas.
- Excluir foto remove o arquivo do Storage e marca `deleted_at`.

### 8.8 Horários e fuso

- Guardar timestamps em UTC (`timestamptz`). Exibir no fuso do perfil (`America/Recife`).
- `session_date` e dia da semana usam o fuso do perfil, não o UTC.
- Usar `Intl.DateTimeFormat` com `timeZone` (sem bibliotecas de fuso). No Deno (Edge Functions) idem.

---

## 9. Telas e fluxos

Navegação (mobile: barra inferior de 4–5 abas; desktop ≥ 1024 px: barra lateral):

**Hoje/Semana · Progresso · Peso · Perfil** (+ **Admin** para o admin).

### 9.1 Login (`/login`)
- E-mail e senha, botão "Entrar", mostrar/ocultar senha.
- Mensagens de erro claras ("E-mail ou senha incorretos").
- "Esqueci minha senha": informar que o admin redefine (admin usa a tela de Usuários).
- Sessão persistente; abre offline usando sessão salva.

### 9.2 Semana (`/`)
- Faixa dos 7 dias (Seg–Dom) com: nome do dia, título do treino ou "Descanso", marca de concluído/pulado, hoje destacado.
- Card "Treino de hoje" com botão **Começar/Continuar**, progresso (ex.: 3/6 exercícios) e horário previsto.
- Indicador de sequência e contador "treinos nesta semana".
- Tocar num dia abre `/dia/:weekday`.

### 9.3 Dia (`/dia/:weekday`)
- Título do treino, horário, lista de exercícios na ordem, cada um com: nome, selo do tipo (cor), meta ("3 × 8–12 · 20 kg · descanso 90 s"), check de concluído.
- Dia de descanso: mensagem de descanso.
- Em dias passados: mostra o que foi feito (somente leitura, com opção de editar registros).
- Botão "Não treinei hoje" (apenas no dia atual/planejado).
- Botão **Finalizar treino** fixo no rodapé quando há sessão em andamento.

### 9.4 Exercício (`/dia/:weekday/ex/:id`)
Seções, nesta ordem:

1. **Cabeçalho:** nome, tipo, meta do admin, tempo de descanso (informativo).
2. **Como fazer:** descrição (texto) + galeria de fotos/GIFs (toque amplia).
3. **Registro de hoje:** linhas de série (nº, reps, kg), botão salvar/check por série, "+ Série", selo **PR** quando aplicável. Campos numéricos com `inputmode="decimal"`/`numeric` e fonte ≥ 16 px (evita zoom do iOS).
4. **Últimos registros:** as **3 últimas sessões** desse exercício (data + séries "12 × 20 kg"). Toque numa linha para copiar aquelas cargas para hoje.
5. **Recordes:** maior carga, melhor 1RM estimado.
6. **Concluir exercício** (check grande).

### 9.5 Resumo do treino (após finalizar)
- Duração total, hora de início e fim, exercícios concluídos, volume total (Σ reps × kg), lista de PRs, botão "Ver log" com a linha do tempo (primeiro check, cada conclusão e fim, com horários).

### 9.6 Progresso (`/progresso`)
- Seletor de pessoa (só admin) e período (30 dias / 90 dias / 1 ano / tudo).
- Gráficos:
  1. **Carga por exercício** (maior carga por sessão) e **1RM estimado** — escolhe o exercício.
  2. **Volume por sessão** (exercício ou treino inteiro).
  3. **Frequência semanal** (barras: treinos concluídos por semana).
  4. **Duração dos treinos**.
  5. **Distribuição por tipo de exercício** (volume ou séries).
- Calendário de treinos + sequência atual e recorde de sequência.
- Lista de PRs recentes.

### 9.7 Peso e fotos (`/peso`)
- Adicionar peso do dia (decimal). Gráfico de peso corporal com média móvel de 7 dias (opcional). Variação no período.
- Aba **Fotos:** grade cronológica (mais recente primeiro), cada foto com data e peso; adicionar (câmera/galeria), comparar duas, excluir. Admin vê as de todos via seletor.

### 9.8 Perfil (`/perfil`)
- Nome, trocar senha, fuso (padrão `America/Recife`).
- **Lembretes:** ativar notificações (botão que dispara o pedido de permissão por gesto do usuário), antecedência (padrão 60 min), horário do treino por dia da semana.
- Instalação: no iOS fora do modo standalone, exibir guia ilustrado "Como instalar no iPhone".
- Estado da sincronização (pendentes, última sync, itens com erro).
- Caixa de notificações (histórico do que foi enviado).
- Sair.

### 9.9 Admin (`/admin/...`, só papel `admin`)
- **Usuários:** listar, criar (nome, e-mail, senha inicial), redefinir senha, excluir (com confirmação dupla).
- **Tipos de exercício:** CRUD (nome + cor). Não excluir tipo em uso sem reatribuir (ou bloquear com aviso).
- **Biblioteca de exercícios:** CRUD com nome, **tipo** (lista dos tipos criados), **descrição** (texto), upload de **fotos e GIFs** (compressão de imagens; GIF até ~5 MB), ordenar mídias.
- **Editor de treino de [pessoa]** (seletor de pessoa, inclui o próprio admin):
  - Semana com 7 dias: alternar **Treino/Descanso**, título, horário.
  - Em cada dia de treino: adicionar exercício da biblioteca (busca + filtro por tipo), ajustar **séries, reps (texto "8-12"), carga-alvo (kg decimal), tempo de descanso (s)**, observação; **reordenar** (arrastar ou botões subir/descer); duplicar; remover; copiar um dia para outro.
  - Botão **Salvar** (ou salvamento automático com indicador). As alterações geram **um único aviso** à pessoa (agrupamento, seção 11).
- **Ver dados da pessoa:** atalhos para Progresso, Peso, Fotos e Histórico dela.
- (Opcional, fase 8) **Exportar dados** em CSV/JSON.

### 9.10 Estados e microinterações
- Estados vazios amigáveis em todas as listas.
- Confirmação antes de excluir; "Desfazer" (toast) para excluir série/registro.
- Indicador discreto de sincronização no topo: ✓ Sincronizado / ↻ Sincronizando / ⏳ N pendentes / ⚠ Offline.
- Feedback tátil leve (`navigator.vibrate`, quando suportado) ao salvar série e ao bater PR.
- Tela não deve apagar durante o treino: usar **Screen Wake Lock API** quando disponível (opcional, com fallback silencioso).

---

## 10. Sincronização offline (local-first)

### 10.1 Stores no Dexie
`profile`, `exerciseTypes`, `exercises`, `exerciseMedia`, `routineDays`, `routineExercises`, `workoutSessions`, `sessionExercises`, `setLogs`, `sessionEvents`, `bodyWeightLogs`, `progressPhotos` (com `blob` local enquanto não sobe), `outbox`, `syncState` (cursor por tabela).

### 10.2 Direções

| Dados | Direção |
|---|---|
| Catálogo (tipos, exercícios, mídias), treino semanal, perfil | **Servidor → local** (pull) |
| Sessões, exercícios da sessão, séries, eventos, peso, metadados de foto | **Local → servidor** (outbox) + pull (outros aparelhos) |
| Inscrição push | Online-only |
| Criação de contas, editor de treino do admin, dados de outra pessoa | Online-only (direto no Supabase) |

### 10.3 Outbox
- Cada mutação local grava no Dexie **e** enfileira `{seq, table, op: 'upsert'|'delete', row, tries, lastError}`.
- Envio em ordem (`seq`), agrupando por tabela quando possível, com `upsert` por `id` (idempotente).
- Exclusão = upsert com `deleted_at`.
- **Erros de rede/5xx:** retry com backoff exponencial (2s, 5s, 15s, 60s…). **Erros 4xx** (RLS/validação): marcar como falha, exibir em Perfil → Sincronização com "Tentar de novo" / "Descartar".
- Fotos: o blob fica no IndexedDB; sobe para o Storage e só depois grava a linha em `progress_photos`.

### 10.4 Pull incremental
- `select * from <tabela> where updated_at > :cursor order by updated_at` (com sobreposição de ~1 s; upsert local idempotente). RLS filtra o que cada pessoa pode ver.
- Linhas com `deleted_at` removem/ocultam localmente.
- **Gatilhos de sync:** abrir o app, voltar ao primeiro plano (`visibilitychange`), evento `online`, após cada mutação (se online), a cada ~60 s com o app aberto, e assinatura **Realtime** nas tabelas do treino (para o aviso "treino atualizado" em tempo real).
- iOS **não** suporta Background Sync: não depender dele. Sincronizar ao abrir/retornar ao app.

### 10.5 Conflitos
- Registros de execução são de um dono e quase sempre de um aparelho: **último a escrever vence** (`updated_at`).
- `set_logs`, `session_events` são append-mostly: fundir por `id`.
- **Sessão criada em dois aparelhos no mesmo dia** (violação de `workout_sessions_day_uq`): ao receber o erro 23505, buscar a sessão existente, **reatribuir** os filhos locais (`session_exercises`, `set_logs`, `session_events`) ao `id` existente e reenviar; escolher o menor `started_at`.
- Dados do admin são autoritativos do servidor: o pull sobrescreve o local.

### 10.6 Sessão e persistência
- Token do Supabase persistido; renovar quando online. App abre offline com a sessão salva.
- Chamar `navigator.storage.persist()` para reduzir o risco de o iOS limpar o IndexedDB (PWAs instaladas na Tela de Início são poupadas da limpeza de 7 dias do Safari).

---

## 11. Notificações push

### 11.1 Tipos

| Tipo | Quando | Texto (exemplo) | Ao tocar |
|---|---|---|---|
| `workout_reminder` | `scheduled_time − reminder_lead_minutes` (padrão 60 min) em dia de treino | "Treino em 1h: Peito e Tríceps" | Abre `/` (Hoje) |
| `routine_changed` | Após o admin alterar o treino de outra pessoa (agrupado, ~2 min após a última alteração) | "Seu treino foi atualizado por [nome do admin]" | Abre a Semana |

Regras do lembrete:
- Só se `reminders_enabled`, o dia tem treino, tem `scheduled_time` e **não** há sessão `finished`/`skipped`/iniciada no dia.
- Enviar no intervalo `[scheduled − lead, scheduled)`; **nunca** depois do horário do treino.
- Deduplicar por `(user_id, 'workout_reminder', data)` na tabela `notifications`.

### 11.2 Web Push (VAPID)
- Chaves geradas com `npx web-push generate-vapid-keys`. Pública no front (`VITE_VAPID_PUBLIC_KEY`); privada e `VAPID_SUBJECT` (`mailto:...`) nos secrets das Edge Functions.
- O cliente pede permissão **somente por gesto** (botão "Ativar lembretes" em Perfil), registra o service worker, cria a `PushSubscription` e grava em `push_subscriptions`.
- Falhas 404/410 no envio → apagar a inscrição.

### 11.3 iOS (limitações a documentar ao usuário)
- Web Push só funciona no **iOS/iPadOS 16.4+** e **somente com o app adicionado à Tela de Início**. Fora disso, o app deve explicar isso e desabilitar o botão.
- O service worker **sempre** deve chamar `showNotification` no evento `push` (o iOS pode revogar a permissão se não exibir).
- O iOS pode atrasar entregas; o lembrete é "aproximadamente 1 h antes".

### 11.4 Service worker (`src/sw.ts`)
- Precache do app shell (Workbox), `push` → `showNotification` (título, corpo, `data.url`), `notificationclick` → focar janela existente ou abrir `url`.
- Cache das imagens de `exercise-media` (CacheFirst, limite de entradas).
- Fotos de evolução: não cachear em disco no SW (URLs assinadas expiram); exibir a partir do blob local quando existir.

---

## 12. Edge Functions e agendamento

### 12.1 `supabase/functions/admin-users` (chamada pelo front do admin)
- `POST { action: 'create' | 'reset_password' | 'delete', ... }`.
- Valida o JWT do chamador e confirma `role = 'admin'` em `profiles`.
- Usa `SUPABASE_SERVICE_ROLE_KEY` para `auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } })`, `auth.admin.updateUserById` e `auth.admin.deleteUser`.
- Trigger `handle_new_user` cria perfil + 7 dias de descanso.
- Excluir usuário: exigir confirmação no front; remover também a pasta de fotos no Storage.

### 12.2 `supabase/functions/cron-tick` (chamada a cada minuto pelo pg_cron)
Proteção: `--no-verify-jwt` **e** checagem do header `x-cron-secret`.

1. **Lembretes:** para cada perfil com `reminders_enabled`:
   - calcular "agora" no fuso do perfil, obter o dia da semana ISO e o `routine_days` correspondente;
   - se for treino com horário, checar a janela `[scheduled − lead, scheduled)`;
   - checar sessão do dia (não enviar se já treinou/pulou/iniciou);
   - inserir em `notifications` (conflito de `dedupe_key` = já enviado) e enviar o push a todas as inscrições.
2. **Alteração de treino:** buscar `routine_change_events` não processados agrupados por `user_id`, cuja última alteração tenha **> 2 min**; enviar **1** push `routine_changed`, registrar em `notifications` e marcar os eventos como processados.

### 12.3 Agendamento (`0004_cron.sql`)

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- guardar o segredo no Vault (rodar uma vez, com valor aleatório longo)
-- select vault.create_secret('<SEGREDO_ALEATORIO>', 'cron_secret');

select cron.schedule('tick-every-minute', '* * * * *', $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/cron-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
$$);
```

Limpeza opcional (semanal): apagar `routine_change_events` processados há > 30 dias e `notifications` > 180 dias.

---

## 13. PWA e iPhone

- **Manifest:** `name` ("Treinos" — nome configurável em um único lugar), `short_name`, `display: standalone`, `orientation: portrait`, `start_url: "/"`, `scope: "/"`, `theme_color` (azul), `background_color`, ícones 192 e 512 (incluindo **maskable**).
- **Tags no `index.html` para iOS:** `<link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png">`, `<meta name="apple-mobile-web-app-capable" content="yes">`, `<meta name="apple-mobile-web-app-status-bar-style" content="default">`, `<meta name="apple-mobile-web-app-title" content="Treinos">`, `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`, `theme-color` para claro e escuro.
- **Safe areas:** usar `env(safe-area-inset-top/bottom)` no cabeçalho e na barra inferior.
- **Instalação no iOS:** não existe `beforeinstallprompt`. Detectar iOS + Safari + fora do modo standalone (`navigator.standalone`) e exibir um banner "Como instalar" (Compartilhar → Adicionar à Tela de Início). No Android/desktop, usar `beforeinstallprompt` com botão "Instalar".
- **Ícone:** criar um ícone simples (azul sólido, sem gradiente) em SVG e gerar os PNGs necessários; fácil de trocar.
- **Atualização do app:** `registerType: 'prompt'` com toast "Nova versão disponível — Atualizar".
- **Sem internet:** o shell carrega do cache; tela de login exige conexão apenas na primeira vez.

---

## 14. Design system

Princípios: simples, leve, **cores sólidas, sem gradientes**, bordas suaves, bastante espaço, leitura rápida durante o treino.

### 14.1 Tokens (`src/styles/tokens.css`)

```css
:root {
  --blue-50:#EFF6FF; --blue-100:#DBEAFE; --blue-200:#BFDBFE; --blue-500:#3B82F6;
  --blue-600:#2563EB; --blue-700:#1D4ED8; --blue-800:#1E40AF;

  --bg:#F8FAFC; --surface:#FFFFFF; --surface-2:#F1F5F9;
  --text:#0F172A; --text-muted:#64748B; --border:#E2E8F0;
  --primary:var(--blue-600); --primary-hover:var(--blue-700); --on-primary:#FFFFFF;
  --primary-soft:var(--blue-50);

  --success:#16A34A; --warning:#D97706; --danger:#DC2626;
  --pr:#F59E0B;   /* selo de recorde */

  --radius:12px; --radius-sm:8px;
  --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px; --space-6:24px; --space-8:32px;
  --tap:44px;     /* alvo de toque mínimo */
  --font: system-ui,-apple-system,"SF Pro Text","Segoe UI",Roboto,sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg:#0B1220; --surface:#111B2E; --surface-2:#182338;
    --text:#E5EDFA; --text-muted:#93A4BF; --border:#22304A;
    --primary:#3B82F6; --primary-hover:#60A5FA; --primary-soft:#14233F;
  }
}
:root[data-theme="dark"] { /* mesmos valores do bloco escuro */ }
```

### 14.2 Regras de UI
- Fonte do sistema; tamanho base 16 px; títulos 20–24 px; inputs ≥ 16 px.
- Cartões com borda de 1 px e raio 12 px; **sombras mínimas ou nenhuma**.
- Botão primário azul sólido; secundário com contorno; destrutivo vermelho só em confirmações.
- Cor do **tipo de exercício** aparece como um pequeno selo/ponto (não pinta a tela inteira).
- Selo PR em âmbar (`--pr`) com ícone de troféu/estrela.
- Contraste mínimo WCAG AA nos dois temas.
- Sem animações pesadas; transições ≤ 150 ms; respeitar `prefers-reduced-motion`.
- Mobile-first; breakpoints: 640 px, 1024 px. No desktop, conteúdo centralizado (máx. ~960 px) com barra lateral.
- Acessibilidade: rótulos em todos os campos, foco visível, botões com `aria-label`, navegação por teclado no editor admin.
- Seletor de tema opcional em Perfil (Automático / Claro / Escuro).

---

## 15. Estrutura de pastas

```
treinos/
├─ CLAUDE.md
├─ PROJETO.md
├─ DECISOES.md
├─ README.md
├─ package.json · tsconfig.json · vite.config.ts · .env.example
├─ public/
│  ├─ icons/ (192, 512, maskable, apple-touch-icon-180)
│  └─ _redirects            # "/* /index.html 200" (Cloudflare Pages)
├─ src/
│  ├─ main.tsx · App.tsx · routes.tsx
│  ├─ sw.ts                 # service worker (precache + push)
│  ├─ styles/ (tokens.css, base.css)
│  ├─ lib/
│  │  ├─ supabase.ts        # cliente
│  │  ├─ db.ts              # Dexie: schema e versões
│  │  ├─ sync/ (engine.ts, outbox.ts, pull.ts, realtime.ts)
│  │  ├─ pr.ts              # cálculo de PR/1RM (puro, testado)
│  │  ├─ streak.ts          # sequência (pura, testada)
│  │  ├─ numbers.ts         # parse/format decimal pt-BR
│  │  ├─ dates.ts           # fuso, data local, dia ISO
│  │  ├─ image.ts           # compressão/EXIF
│  │  ├─ push.ts            # permissão e inscrição
│  │  └─ pwa.ts             # instalação/atualização
│  ├─ features/
│  │  ├─ auth/ · week/ · day/ · exercise/ · session/
│  │  ├─ progress/ · weight/ · photos/ · profile/
│  │  └─ admin/ (users, types, library, routine-editor)
│  └─ components/ (Button, Card, Tabs, NumberInput, Toast, Modal, Badge, SyncStatus, Chart)
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/ (0001_schema, 0002_triggers, 0003_rls, 0004_cron, 0005_seed_opcional)
│  └─ functions/ (admin-users, cron-tick, _shared/push.ts)
└─ tests/ (unit/, rls/, e2e/)
```

Seed opcional (`0005`): tipos iniciais editáveis (Peito, Costas, Pernas, Ombros, Bíceps, Tríceps, Abdômen, Glúteos, Cardio) — o admin pode apagar/alterar.

---

## 16. Fases de construção (ordem de trabalho)

> Todas as fases devem ser concluídas. Um commit por fase. Não parar entre elas.

### Fase 1 — Fundação: projeto, banco, login, permissões
- Scaffold Vite + React + TS, estilos base e tokens, rotas protegidas, cliente Supabase, `.env.example`.
- Migrations 0001–0003 (+ seed opcional). Auth e-mail/senha, `AuthProvider`, guarda de rota por papel.
- Edge Function `admin-users` + tela **Admin → Usuários**.
- **Aceite:** admin entra, cria a usuária, ela entra; usuária não acessa `/admin`; testes de RLS passando.

### Fase 2 — Catálogo e editor do admin
- Tipos de exercício, biblioteca de exercícios (descrição + upload de fotos/GIF com compressão), Storage.
- Editor de treino da semana (dias, treino/descanso, título, horário, exercícios, séries/reps/kg/descanso, reordenar, duplicar, remover).
- **Aceite:** admin monta a semana inteira da usuária; ela vê (somente leitura) em outro aparelho.

### Fase 3 — Dexie, sync e telas de uso
- Schema local, motor de sync (pull + outbox), indicador de sincronização.
- Telas Semana, Dia e Exercício com descrição, mídia e "últimos registros".
- Registro de séries (decimais), pré-preenchimento.
- **Aceite:** registrar séries offline, reconectar e ver no outro aparelho; decimais corretos.

### Fase 4 — Sessão, conclusão, logs e PR
- Criação de sessão com snapshot, check de exercício, finalizar, duração, resumo, log de eventos, reabrir, "Não treinei hoje".
- PR no cliente (puro) e servidor (trigger), selo e lista de recordes.
- **Aceite:** duração = fim − primeiro check; eventos gravados com horários; PR aparece e confere com o servidor.

### Fase 5 — Progresso, peso e fotos
- Gráficos (carga, 1RM, volume, frequência, duração, por tipo), calendário, sequência.
- Peso corporal + gráfico; fotos (foto exige peso, compressão, URL assinada, comparativo).
- Seletor "Ver: [pessoa]" para o admin.
- **Aceite:** admin vê tudo da usuária; usuária só vê o próprio.

### Fase 6 — PWA, offline completo e notificações
- Manifest, ícones, tags iOS, service worker (precache, push, clique), banner de instalação iOS.
- Inscrição push, Edge Function `cron-tick`, pg_cron, lembrete 1 h antes, aviso de treino alterado (agrupado).
- **Aceite:** instalar no iPhone (iOS ≥ 16.4), receber lembrete e aviso; app abre e registra séries sem internet.

### Fase 7 — Acabamento, testes e publicação
- Estados vazios, erros, acessibilidade, desempenho (bundle, lazy), tema claro/escuro, textos pt-BR revisados.
- Testes (seção 17), `README.md` com passo a passo (seção 18), `DECISOES.md`.
- Deploy no Cloudflare Pages.
- **Aceite:** checklist da seção 21 marcado.

### Fase 8 — Opcional (só se sobrar tempo)
- Exportar dados (CSV/JSON) para o admin, backup manual, tema manual, média móvel do peso.

---

## 17. Testes

**Unitários (Vitest)** — obrigatórios:
- `numbers.ts`: `"12,5"`, `"12.5"`, `"12,555"` (trunca/valida 2 casas), vazio, negativo.
- `pr.ts`: primeiro registro não é PR; PR de carga; PR de 1RM; PR de reps com peso 0; empate não é PR; fórmula de Epley.
- `streak.ts`: descanso não quebra; dia planejado sem treino quebra; "não treinei" quebra; hoje não quebra.
- `dates.ts`: dia ISO e data local em `America/Recife` perto da meia-noite UTC.
- Duração: `finished_at − started_at`.
- Outbox: ordem, retry/backoff, erro 4xx vira "falha", idempotência.
- Conflito de sessão duplicada (23505) reatribui filhos.

**RLS (SQL/pgTAP ou script com duas contas)** — obrigatórios:
- Usuária **não** lê dados de outra usuária; **não** altera `role`; **não** escreve em `routine_*`, `exercises`, `exercise_types`.
- Admin lê sessões/peso/fotos de todos e escreve `routine_*`.
- Storage: usuária não lê foto de outra; admin lê todas; só admin escreve em `exercise-media`.
- Cadastro público desativado.

**E2E (Playwright, opcional):** login, abrir treino do dia, registrar série, concluir e finalizar, ver no gráfico.

**Manual (roteiro no README):** instalar no iPhone, modo avião (registrar → reconectar → sincronizar), notificação de lembrete, aviso de treino alterado, foto com peso.

---

## 18. Publicação passo a passo (conteúdo base do README)

**A. Supabase**
1. Criar conta e um projeto em supabase.com (plano gratuito). Guardar **Project URL** e **anon key**.
2. Authentication → desativar "Allow new users to sign up". Definir senha mínima de 8 caracteres.
3. Instalar a CLI: `npm i -g supabase` (ou usar `npx supabase`). Fazer `supabase login` e `supabase link --project-ref <PROJECT_REF>`.
4. Aplicar as migrations: `supabase db push`.
5. Gerar chaves VAPID: `npx web-push generate-vapid-keys`.
6. Definir secrets das funções:
   `supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:seu@email CRON_SECRET=<valor-aleatorio-longo>`
7. Publicar funções: `supabase functions deploy admin-users` e `supabase functions deploy cron-tick --no-verify-jwt`.
8. No SQL Editor: criar o segredo no Vault (`select vault.create_secret('<mesmo CRON_SECRET>', 'cron_secret');`) e rodar o agendamento da seção 12.3 trocando `<PROJECT_REF>`.
9. **Criar o primeiro admin:** Authentication → Users → "Add user" (e-mail + senha, marcar confirmado). Depois, no SQL Editor:
   `update public.profiles set role = 'admin' where id = '<UUID do usuário>';`
10. Conferir se os buckets `progress-photos` (privado) e `exercise-media` (público) existem.

**B. Cloudflare Pages**
1. Subir o código para um repositório no GitHub.
2. Cloudflare → Workers & Pages → Create → Pages → conectar o repositório.
3. Build command: `npm run build`; output: `dist`.
4. Variáveis de ambiente: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY`.
5. Deploy. (Alternativa: GitHub Pages com Action de build; lembrar do fallback de SPA.)

**C. Primeiro uso**
1. Admin entra, cria tipos, exercícios e monta a semana.
2. Admin cria a conta da usuária (Admin → Usuários) e envia e-mail/senha.
3. Usuária abre o link no **Safari** do iPhone → Compartilhar → **Adicionar à Tela de Início** → abrir pelo ícone → Perfil → **Ativar lembretes**.

---

## 19. Riscos e limites conhecidos

| Risco | Mitigação |
|---|---|
| Push no iOS só com app instalado (iOS ≥ 16.4) e pode atrasar | Explicar na UI; lembrete "aprox. 1 h antes"; caixa interna de notificações como reserva |
| iOS pode limpar IndexedDB de sites **não instalados** após ~7 dias sem uso | Instalar na Tela de Início; `storage.persist()`; sync frequente |
| Plano gratuito do Supabase pode **pausar o projeto após inatividade** e tem limites de armazenamento (~1 GB de arquivos) e de banco | Uso diário evita pausa; compressão de imagens; limite de tamanho de GIF; **verificar os limites atuais na documentação do Supabase** |
| Plano gratuito sem backups garantidos | Fase 8: exportação manual; admin pode exportar periodicamente |
| Edge Function a cada minuto (≈ 43 mil chamadas/mês) | Dentro das cotas gratuitas atuais; validar; dá para reduzir para a cada 5 min (janela maior + deduplicação) |
| Relógio do aparelho errado afeta `logged_at` | `updated_at` sempre do servidor; ordenar histórico por `logged_at` com fallback |
| Fotos = dado pessoal sensível | Bucket privado, URLs assinadas, RLS; sem analytics de terceiros |
| Admin altera treino durante o treino da usuária | Sessão em andamento fica intacta; oferecer "aplicar mudanças" |

---

## 20. Variáveis de ambiente

`.env.example`:
```
VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key-publica>
VITE_VAPID_PUBLIC_KEY=<chave-vapid-publica>
VITE_APP_NAME=Treinos
```
Secrets das Edge Functions (nunca no repositório): `SUPABASE_SERVICE_ROLE_KEY` (já injetada pelo Supabase), `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`.

---

## 21. Checklist final de aceite

**Acesso e permissões**
- [ ] Login por e-mail/senha; cadastro público desativado.
- [ ] Admin cria, redefine senha e exclui usuários.
- [ ] Usuária não acessa rotas/dados de admin nem de outros usuários (RLS testada).

**Treino**
- [ ] Admin cria tipos e exercícios (descrição + fotos/GIFs) e escolhe o tipo ao montar o treino.
- [ ] Admin monta a semana (treino/descanso), edita séries, reps, carga, descanso; adiciona, edita, exclui, reordena.
- [ ] Usuária vê a semana, toca no dia e vê os exercícios com descrição e mídia.
- [ ] Registro de séries com reps e kg decimais; pré-preenchimento; últimos registros visíveis.
- [ ] Concluir exercício e finalizar treino; duração correta; log de eventos com horários.
- [ ] "Não treinei hoje" com motivo opcional; aparece no calendário.
- [ ] PR destacado (série, resumo e tela do exercício).

**Progresso e corpo**
- [ ] Gráficos de carga, 1RM, volume, frequência, duração, distribuição por tipo.
- [ ] Calendário e sequência corretos.
- [ ] Peso corporal com gráfico; foto exige peso; admin vê todas as fotos.

**Sync, PWA e notificações**
- [ ] Registro offline e sincronização automática entre iPhone e PC.
- [ ] Instalável no iPhone (Tela de Início) e funcional no navegador.
- [ ] Lembrete 1 h antes do treino; aviso único quando o admin altera o treino.
- [ ] Indicador de sincronização e tela de itens com erro.

**Qualidade**
- [ ] Visual azul, sólido, sem gradientes; claro/escuro; responsivo (celular e PC).
- [ ] Desempenho e acessibilidade ≥ 90 no Lighthouse; bundle inicial < 250 KB gzip.
- [ ] Testes unitários e de RLS passando; README com passo a passo completo.
