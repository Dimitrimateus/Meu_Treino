-- 0003 — RLS e Storage (ver PROJETO.md, seção 7)

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

-- ============ STORAGE ============
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
