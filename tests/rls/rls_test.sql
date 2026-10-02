-- Testes de RLS, Storage e triggers. Cada falha aborta com exceção.
\set QUIET on
create schema tests;
grant usage on schema tests to authenticated, anon;

create function tests.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALHOU: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;

-- executa SQL e devolve linhas afetadas (0 quando a RLS esconde a linha)
create function tests.affected(q text) returns int language plpgsql as $$
declare n int;
begin execute q; get diagnostics n = row_count; return n; end $$;

-- espera erro (RLS em INSERT/WITH CHECK, trigger, etc.)
create function tests.raises(q text, msg text) returns void language plpgsql as $$
begin
  begin execute q;
  exception when others then raise notice 'ok - % (%)', msg, sqlerrm; return;
  end;
  raise exception 'FALHOU: % (deveria dar erro)', msg;
end $$;

create function tests.login(uid uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false); end $$;

grant execute on all functions in schema tests to authenticated, anon;

-- ===== contas =====
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@x.com', '{"name":"Dimitri"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bia@x.com',   '{"name":"Bia"}'),
  ('00000000-0000-0000-0000-00000000000c', 'outra@x.com', '{}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000a';

select tests.ok((select count(*) from public.profiles) = 3, 'trigger cria perfil para cada usuário');
select tests.ok((select count(*) from public.routine_days where user_id = '00000000-0000-0000-0000-00000000000b' and is_rest) = 7, 'trigger cria 7 dias de descanso');
select tests.ok((select name from public.profiles where id = '00000000-0000-0000-0000-00000000000c') = 'outra', 'nome padrão = parte do e-mail');

insert into public.exercises (id, name, type_id) values
  ('e0000000-0000-0000-0000-000000000001', 'Supino', (select id from public.exercise_types where name = 'Peito'));

-- ===== ADMIN =====
select tests.login('00000000-0000-0000-0000-00000000000a');
set role authenticated;

select tests.ok(public.is_admin(), 'admin é admin');
select tests.ok((select count(*) from public.profiles) = 3, 'admin lê todos os perfis');
select tests.ok(tests.affected($$update public.routine_days set is_rest = false, title = 'Peito', scheduled_time = '18:00'
  where user_id = '00000000-0000-0000-0000-00000000000b' and weekday = 1$$) = 1, 'admin edita treino da usuária');
insert into public.routine_exercises (id, routine_day_id, user_id, exercise_id, target_sets, target_reps, target_weight_kg)
  select 'f0000000-0000-0000-0000-000000000001', id, '00000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-000000000001', 3, '8-12', 20.5
  from public.routine_days where user_id = '00000000-0000-0000-0000-00000000000b' and weekday = 1;
select tests.ok((select user_id from public.routine_exercises where id = 'f0000000-0000-0000-0000-000000000001') = '00000000-0000-0000-0000-00000000000b',
  'routine_exercises.user_id copiado do dia (ignora valor enviado)');
insert into public.exercise_types (name) values ('Antebraço');
select tests.ok(tests.affected($$update public.profiles set reminder_lead_minutes = 30 where id = '00000000-0000-0000-0000-00000000000b'$$) = 1, 'admin edita perfil de outro');
reset role;

select tests.ok((select count(*) from public.routine_change_events where user_id = '00000000-0000-0000-0000-00000000000b') >= 2,
  'alteração do admin no treino de outra pessoa gera routine_change_events');
select tests.ok((select count(*) from public.routine_change_events where user_id = '00000000-0000-0000-0000-00000000000a') = 0,
  'alteração no próprio treino não gera aviso');

-- ===== USUÁRIA B =====
select tests.login('00000000-0000-0000-0000-00000000000b');
set role authenticated;

select tests.ok(not public.is_admin(), 'usuária não é admin');
select tests.ok((select count(*) from public.profiles) = 1, 'usuária só vê o próprio perfil');
select tests.raises($$update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000b'$$, 'usuária não altera o próprio papel');
select tests.ok(tests.affected($$update public.profiles set name = 'Bia S.' where id = '00000000-0000-0000-0000-00000000000b'$$) = 1, 'usuária edita o próprio nome');
select tests.ok(tests.affected($$update public.profiles set name = 'x' where id = '00000000-0000-0000-0000-00000000000c'$$) = 0, 'usuária não edita perfil de outra');
select tests.ok((select count(*) from public.routine_days) = 7, 'usuária lê só o próprio treino');
select tests.ok((select count(*) from public.routine_exercises) = 1, 'usuária lê exercícios do próprio treino');
select tests.ok(tests.affected($$update public.routine_days set title = 'hack' where user_id = '00000000-0000-0000-0000-00000000000b'$$) = 0, 'usuária não escreve em routine_days');
select tests.raises($$insert into public.routine_exercises (routine_day_id, user_id, exercise_id)
  select id, user_id, 'e0000000-0000-0000-0000-000000000001' from public.routine_days limit 1$$, 'usuária não insere routine_exercises');
select tests.raises($$insert into public.exercises (name) values ('X')$$, 'usuária não insere exercises');
select tests.raises($$insert into public.exercise_types (name) values ('Y')$$, 'usuária não insere exercise_types');
select tests.ok(tests.affected($$delete from public.exercise_types$$) = 0, 'usuária não apaga exercise_types');
select tests.ok((select count(*) from public.exercises) = 1, 'usuária lê o catálogo');

-- horário próprio via RPC (só scheduled_time)
select public.set_my_schedule(1::smallint, '19:30'::time);
select tests.ok((select scheduled_time from public.routine_days where weekday = 1) = '19:30', 'set_my_schedule altera o horário próprio');

-- sessão + séries + PR
insert into public.workout_sessions (id, user_id, session_date, status, started_at)
  values ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', '2026-10-01', 'in_progress', now());
insert into public.session_exercises (id, session_id, user_id, exercise_id, exercise_name_snapshot)
  values ('5e000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'e0000000-0000-0000-0000-000000000001', 'Supino');
insert into public.set_logs (id, session_exercise_id, session_id, user_id, exercise_id, set_number, reps, weight_kg, logged_at) values
  ('51000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'e0000000-0000-0000-0000-000000000001', 1, 10, 20, '2026-10-01 18:00Z'),
  ('51000000-0000-0000-0000-000000000002', '5e000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'e0000000-0000-0000-0000-000000000001', 2, 10, 22.5, '2026-10-01 18:05Z'),
  ('51000000-0000-0000-0000-000000000003', '5e000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'e0000000-0000-0000-0000-000000000001', 3, 8, 22.5, '2026-10-01 18:10Z');
select tests.ok((select not is_pr from public.set_logs where set_number = 1), 'primeiro registro não é PR');
select tests.ok((select pr_kinds = '{weight,e1rm}' from public.set_logs where set_number = 2), 'PR de carga e 1RM');
select tests.ok((select not is_pr from public.set_logs where set_number = 3), 'empate de carga com 1RM menor não é PR');
insert into public.set_logs (id, session_exercise_id, session_id, user_id, exercise_id, set_number, reps, weight_kg, logged_at) values
  ('51000000-0000-0000-0000-000000000004', '5e000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'e0000000-0000-0000-0000-000000000001', 4, 15, 0, '2026-10-01 18:15Z'),
  ('51000000-0000-0000-0000-000000000005', '5e000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'e0000000-0000-0000-0000-000000000001', 5, 16, 0, '2026-10-01 18:20Z');
select tests.ok((select pr_kinds = '{reps}' from public.set_logs where set_number = 5), 'PR de reps com peso 0');
select tests.raises($$insert into public.workout_sessions (id, user_id, session_date) values (gen_random_uuid(), '00000000-0000-0000-0000-00000000000b', '2026-10-01')$$,
  'segunda sessão no mesmo dia viola workout_sessions_day_uq (23505)');
select tests.raises($$insert into public.workout_sessions (id, user_id, session_date) values (gen_random_uuid(), '00000000-0000-0000-0000-00000000000c', '2026-10-02')$$,
  'usuária não cria sessão para outra pessoa');

insert into public.body_weight_logs (id, user_id, measured_on, weight_kg) values
  ('b0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', '2026-10-01', 61.35);
insert into public.progress_photos (id, user_id, body_weight_log_id, taken_on, storage_path) values
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-000000000001', '2026-10-01', '00000000-0000-0000-0000-00000000000b/a.jpg');
select tests.raises($$insert into public.progress_photos (id, user_id, taken_on, storage_path) values (gen_random_uuid(), '00000000-0000-0000-0000-00000000000b', '2026-10-01', 'x')$$,
  'foto exige peso (body_weight_log_id obrigatório)');
select tests.raises($$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('00000000-0000-0000-0000-00000000000c', 'e', 'p', 'a')$$,
  'usuária não cria inscrição push de outra');

-- Storage
insert into storage.objects (bucket_id, name) values ('progress-photos', '00000000-0000-0000-0000-00000000000b/a.jpg');
select tests.raises($$insert into storage.objects (bucket_id, name) values ('progress-photos', '00000000-0000-0000-0000-00000000000c/x.jpg')$$, 'usuária não grava na pasta de outra');
select tests.raises($$insert into storage.objects (bucket_id, name) values ('exercise-media', 'x.png')$$, 'usuária não grava em exercise-media');
reset role;

-- ===== USUÁRIA C (outra) =====
insert into storage.objects (bucket_id, name) values ('progress-photos', '00000000-0000-0000-0000-00000000000c/c.jpg');
select tests.login('00000000-0000-0000-0000-00000000000c');
set role authenticated;
select tests.ok((select count(*) from public.workout_sessions) = 0, 'outra usuária não lê sessões alheias');
select tests.ok((select count(*) from public.set_logs) = 0, 'outra usuária não lê séries alheias');
select tests.ok((select count(*) from public.body_weight_logs) = 0, 'outra usuária não lê peso alheio');
select tests.ok((select count(*) from public.progress_photos) = 0, 'outra usuária não lê fotos alheias');
select tests.ok((select count(*) from storage.objects where bucket_id = 'progress-photos') = 1, 'Storage: usuária só lê a própria foto');
select tests.ok(tests.affected($$update public.workout_sessions set status = 'finished'$$) = 0, 'outra usuária não altera sessão alheia');
reset role;

-- ===== ADMIN lê tudo, mas não escreve dados da pessoa =====
select tests.login('00000000-0000-0000-0000-00000000000a');
set role authenticated;
select tests.ok((select count(*) from public.workout_sessions) = 1, 'admin lê sessões de todos');
select tests.ok((select count(*) from public.set_logs) = 5, 'admin lê séries de todos');
select tests.ok((select count(*) from public.body_weight_logs) = 1, 'admin lê peso de todos');
select tests.ok((select count(*) from public.progress_photos) = 1, 'admin lê fotos de todos');
select tests.ok((select count(*) from storage.objects where bucket_id = 'progress-photos') = 2, 'Storage: admin lê todas as fotos');
select tests.ok(tests.affected($$update public.set_logs set reps = 99$$) = 0, 'admin não altera séries de outra pessoa');
insert into storage.objects (bucket_id, name) values ('exercise-media', 'supino.png');
select tests.ok(true, 'Storage: admin grava em exercise-media');
reset role;

-- ===== anon não lê nada =====
select set_config('request.jwt.claims', '', false);
set role anon;
select tests.ok((select count(*) from public.exercises) = 0, 'anon não lê o catálogo');
select tests.ok((select count(*) from public.profiles) = 0, 'anon não lê perfis');
reset role;
