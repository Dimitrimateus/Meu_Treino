-- 0006 — Complementos (ver DECISOES.md)

-- A própria pessoa pode ajustar o horário do treino de cada dia em Perfil (seção 2,
-- "Padrão assumido"), mas a RLS só deixa o admin escrever em routine_days.
-- Esta função altera SOMENTE scheduled_time do próprio usuário.
create or replace function public.set_my_schedule(p_weekday smallint, p_time time)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;
  update public.routine_days
     set scheduled_time = p_time
   where user_id = auth.uid() and weekday = p_weekday;
end $$;
revoke all on function public.set_my_schedule(smallint, time) from public, anon;
grant execute on function public.set_my_schedule(smallint, time) to authenticated;

-- Limites dos buckets (GIF até ~5 MB; fotos já chegam comprimidas)
update storage.buckets set file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif']
  where id = 'exercise-media';
update storage.buckets set file_size_limit = 3145728,
  allowed_mime_types = array['image/jpeg','image/webp']
  where id = 'progress-photos';

-- Realtime nas tabelas do treino (aviso "treino atualizado" em tempo real)
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.routine_days, public.routine_exercises;
    exception when duplicate_object then null;
    end;
  end if;
end $$;
