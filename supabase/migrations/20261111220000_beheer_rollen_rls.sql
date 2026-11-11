-- De gebruikerspagina leest rollen met de ingelogde sessie.
-- Zonder policy zag die sessie niets; de service-role was de enige lezer.
-- anon verliest de schrijfrechten die alleen door RLS werden tegengehouden.

revoke all on table public.beheer_rollen from anon;
revoke all on table public.beheer_rol_rechten from anon;

grant select, insert, update, delete on table public.beheer_rollen to authenticated;
grant select, insert, update, delete on table public.beheer_rol_rechten to authenticated;

drop policy if exists beheer_rollen_select on public.beheer_rollen;
create policy beheer_rollen_select on public.beheer_rollen
  for select to authenticated
  using ((select app.heeft_recht('gebruikers', 'lezen')));

drop policy if exists beheer_rollen_schrijven on public.beheer_rollen;
create policy beheer_rollen_schrijven on public.beheer_rollen
  for all to authenticated
  using ((select app.heeft_recht('gebruikers', 'schrijven')))
  with check ((select app.heeft_recht('gebruikers', 'schrijven')));

drop policy if exists beheer_rol_rechten_select on public.beheer_rol_rechten;
create policy beheer_rol_rechten_select on public.beheer_rol_rechten
  for select to authenticated
  using ((select app.heeft_recht('gebruikers', 'lezen')));

drop policy if exists beheer_rol_rechten_schrijven on public.beheer_rol_rechten;
create policy beheer_rol_rechten_schrijven on public.beheer_rol_rechten
  for all to authenticated
  using ((select app.heeft_recht('gebruikers', 'schrijven')))
  with check ((select app.heeft_recht('gebruikers', 'schrijven')));
