-- 0004 — Agendamento do cron-tick (ver PROJETO.md, seção 12.3)
--
-- A URL do projeto e o segredo ficam no Vault (nada sensível no repositório).
-- Rodar UMA vez no SQL Editor, depois do `supabase db push`:
--   select vault.create_secret('https://<PROJECT_REF>.supabase.co', 'project_url');
--   select vault.create_secret('<MESMO_VALOR_DO_CRON_SECRET>', 'cron_secret');
-- Enquanto os segredos não existirem, o job roda e não faz nada.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.call_cron_tick() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/cron-tick',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb
  );
end $$;
revoke all on function public.call_cron_tick() from public, anon, authenticated;

select cron.schedule('tick-every-minute', '* * * * *', $$ select public.call_cron_tick(); $$);

-- limpeza semanal (domingo 03:17 UTC)
select cron.schedule('cleanup-weekly', '17 3 * * 0', $$
  delete from public.routine_change_events where processed_at < now() - interval '30 days';
  delete from public.notifications where created_at < now() - interval '180 days';
$$);
