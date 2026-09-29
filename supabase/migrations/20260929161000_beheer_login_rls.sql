-- Supabase-login: RLS op de accounttabellen.
-- Service role en de databasebeheerder mogen de Super Admin-vlag zetten.
-- Gewone gebruikers niet.

create or replace function app.bescherm_super_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- session_user blijft de sessie-rol (niet de eigenaar van deze security-definer-functie).
  if session_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  if tg_op = 'INSERT' and new.is_super_admin = true and not app.is_super_admin() then
    raise exception 'Alleen Super Admin mag Super Admin-rechten toekennen';
  end if;
  if tg_op = 'UPDATE'
     and new.is_super_admin is distinct from old.is_super_admin
     and not app.is_super_admin() then
    raise exception 'Alleen Super Admin mag Super Admin-rechten wijzigen';
  end if;
  return new;
end;
$$;

revoke all on function app.bescherm_super_admin() from public, anon, authenticated;

alter table public.profielen enable row level security;
alter table public.modules enable row level security;
alter table public.gebruikersrechten enable row level security;

revoke all on public.profielen from anon;
revoke all on public.modules from anon;
revoke all on public.gebruikersrechten from anon;

grant select, update on public.profielen to authenticated;
grant select on public.modules to authenticated;
grant select, insert, update, delete on public.gebruikersrechten to authenticated;

drop policy if exists profielen_select on public.profielen;
drop policy if exists profielen_update on public.profielen;
create policy profielen_select on public.profielen
  for select to authenticated
  using ((select app.heeft_recht('gebruikers', 'lezen')) or id = (select auth.uid()));
create policy profielen_update on public.profielen
  for update to authenticated
  using ((select app.heeft_recht('gebruikers', 'schrijven')) or id = (select auth.uid()))
  with check ((select app.heeft_recht('gebruikers', 'schrijven')) or id = (select auth.uid()));

drop policy if exists modules_select on public.modules;
create policy modules_select on public.modules
  for select to authenticated using (true);

drop policy if exists gebruikersrechten_select on public.gebruikersrechten;
drop policy if exists gebruikersrechten_schrijven on public.gebruikersrechten;
create policy gebruikersrechten_select on public.gebruikersrechten
  for select to authenticated
  using ((select app.heeft_recht('gebruikers', 'lezen')) or profiel_id = (select auth.uid()));
create policy gebruikersrechten_schrijven on public.gebruikersrechten
  for all to authenticated
  using ((select app.heeft_recht('gebruikers', 'schrijven')))
  with check ((select app.heeft_recht('gebruikers', 'schrijven')));

grant execute on function app.is_super_admin() to authenticated, service_role;
grant execute on function app.heeft_recht(text, text) to authenticated, service_role;
