-- 0002 — Triggers (ver PROJETO.md, seção 6.3)

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
      if new.weight_kg > prev_w then kinds := array_append(kinds, 'weight'); end if;
      if e1 > coalesce(prev_e1, 0) then kinds := array_append(kinds, 'e1rm'); end if;
    elsif new.reps > coalesce(prev_reps, 0) then
      kinds := array_append(kinds, 'reps');
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
