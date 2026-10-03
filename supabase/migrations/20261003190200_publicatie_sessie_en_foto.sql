-- Publiceren liep via een service-role sleutel die de API weigert.
-- De ingelogde beheerder met agendarecht roept dezelfde functie aan.
-- De kern blijft onbereikbaar voor anon en authenticated.
-- Foto's van de publicatiepagina horen in de publieke bucket public-media.

do $$
begin
  if to_regprocedure('public.beheer_publicatie_kern(text,bigint,text,jsonb,text,uuid)') is null then
    alter function public.beheer_publicatie(text, bigint, text, jsonb, text, uuid)
      rename to beheer_publicatie_kern;
  end if;
end $$;

revoke all on function public.beheer_publicatie_kern(text, bigint, text, jsonb, text, uuid) from public, anon, authenticated;

create or replace function public.beheer_publicatie(
  p_tabel text,
  p_id bigint,
  p_actie text,
  p_payload jsonb,
  p_actor_naam text,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') is distinct from 'service_role'
     and not coalesce(app.heeft_recht('agenda', 'schrijven'), false) then
    return jsonb_build_object(
      'ok', false,
      'melding', 'Geen recht om deze publicatie op te slaan.',
      'mail', false,
      'workflow', false,
      'jobs', 0
    );
  end if;
  return public.beheer_publicatie_kern(p_tabel, p_id, p_actie, p_payload, p_actor_naam, p_actor_id);
end;
$$;

revoke all on function public.beheer_publicatie(text, bigint, text, jsonb, text, uuid) from public, anon;
grant execute on function public.beheer_publicatie(text, bigint, text, jsonb, text, uuid) to authenticated, service_role;

alter function public.slug_van_tekst(text) set search_path = public;
alter function public.publicatie_slug_vrij(text, text, bigint) set search_path = public;
alter function public.unieke_publicatie_slug(text, text, text, bigint) set search_path = public;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'public-media',
  'public-media',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists public_media_lezen on storage.objects;
drop policy if exists public_media_toevoegen on storage.objects;
drop policy if exists public_media_wijzigen on storage.objects;

create policy public_media_lezen on storage.objects
  for select to authenticated
  using (bucket_id = 'public-media' and (select app.heeft_recht('agenda', 'lezen')));

create policy public_media_toevoegen on storage.objects
  for insert to authenticated
  with check (bucket_id = 'public-media' and (select app.heeft_recht('agenda', 'schrijven')));

create policy public_media_wijzigen on storage.objects
  for update to authenticated
  using (bucket_id = 'public-media' and (select app.heeft_recht('agenda', 'schrijven')))
  with check (bucket_id = 'public-media' and (select app.heeft_recht('agenda', 'schrijven')));
