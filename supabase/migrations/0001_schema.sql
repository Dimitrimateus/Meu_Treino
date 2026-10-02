-- 0001 — Esquema principal (ver PROJETO.md, seção 6.2)

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
