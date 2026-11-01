-- Adresonderdelen, privé-foto's bij expositie-aanvragen, publieke tariefregels
-- en het extra ontvangstadres. Bestaande rijen blijven staan. Geen drops van data.

alter table public.aanvragen
  add column if not exists straat text,
  add column if not exists huisnummer text,
  add column if not exists huisnummer_toevoeging text,
  add column if not exists postcode text,
  add column if not exists woonplaats text,
  add column if not exists foto_upload_token uuid;

create table if not exists public.aanvraag_fotos (
  id bigint generated always as identity primary key,
  aanvraag_id bigint not null references public.aanvragen (id) on delete restrict,
  bestandsnaam text not null,
  storage_pad text not null unique,
  mime_type text not null,
  bytes integer not null check (bytes > 0 and bytes <= 8000000),
  aangemaakt_op timestamptz not null default now()
);

create index if not exists aanvraag_fotos_aanvraag_id_idx on public.aanvraag_fotos (aanvraag_id);

alter table public.aanvraag_fotos enable row level security;
revoke all on public.aanvraag_fotos from public, anon;
grant select on public.aanvraag_fotos to authenticated;

drop policy if exists aanvraag_fotos_lezen on public.aanvraag_fotos;
create policy aanvraag_fotos_lezen on public.aanvraag_fotos
  for select to authenticated
  using ((select app.heeft_recht('aanvragen', 'lezen')));

create or replace function public.aanvraag_foto_pad_toegestaan(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_token uuid;
begin
  if p_name !~ '^aanvragen/[0-9]+/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.(jpg|png|webp)$' then
    return false;
  end if;
  v_id := split_part(p_name, '/', 2)::bigint;
  v_token := split_part(p_name, '/', 3)::uuid;
  if not exists (
    select 1 from public.aanvragen
    where id = v_id and foto_upload_token = v_token
  ) then
    return false;
  end if;
  if (select count(*) from public.aanvraag_fotos where aanvraag_id = v_id) >= 8 then
    return false;
  end if;
  return true;
end;
$$;

revoke all on function public.aanvraag_foto_pad_toegestaan(text) from public;
grant execute on function public.aanvraag_foto_pad_toegestaan(text) to anon, authenticated, service_role;

create or replace function public.registreer_aanvraag_foto(
  p_aanvraag_id bigint,
  p_token uuid,
  p_pad text,
  p_naam text,
  p_mime text,
  p_bytes integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ext text;
begin
  if not exists (
    select 1 from public.aanvragen
    where id = p_aanvraag_id and foto_upload_token = p_token
  ) then
    return jsonb_build_object('ok', false, 'fout', 'Deze upload is niet meer open.');
  end if;
  if p_mime = 'image/jpeg' then
    v_ext := 'jpg';
  elsif p_mime = 'image/png' then
    v_ext := 'png';
  elsif p_mime = 'image/webp' then
    v_ext := 'webp';
  else
    return jsonb_build_object('ok', false, 'fout', 'Gebruik een JPG, PNG of WebP.');
  end if;
  if p_bytes is null or p_bytes <= 0 or p_bytes > 8000000 then
    return jsonb_build_object('ok', false, 'fout', 'Een foto mag maximaal 8 MB zijn.');
  end if;
  if p_pad is distinct from (
    'aanvragen/' || p_aanvraag_id::text || '/' || lower(p_token::text) || '/' || split_part(p_pad, '/', 4)
  ) or p_pad !~ ('\.' || v_ext || '$')
    or p_pad !~ '^aanvragen/[0-9]+/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.(jpg|png|webp)$' then
    return jsonb_build_object('ok', false, 'fout', 'De foto hoort niet bij deze aanvraag.');
  end if;
  if (select count(*) from public.aanvraag_fotos where aanvraag_id = p_aanvraag_id) >= 8 then
    return jsonb_build_object('ok', false, 'fout', 'Je kunt maximaal 8 foto''s toevoegen.');
  end if;
  insert into public.aanvraag_fotos (aanvraag_id, bestandsnaam, storage_pad, mime_type, bytes)
  values (
    p_aanvraag_id,
    left(coalesce(nullif(btrim(p_naam), ''), 'foto'), 120),
    p_pad,
    p_mime,
    p_bytes
  );
  return jsonb_build_object('ok', true);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'fout', 'Deze foto is al gekoppeld.');
end;
$$;

revoke all on function public.registreer_aanvraag_foto(bigint, uuid, text, text, text, integer) from public;
grant execute on function public.registreer_aanvraag_foto(bigint, uuid, text, text, text, integer) to anon, authenticated, service_role;

create or replace function public.sluit_aanvraag_foto_upload(p_aanvraag_id bigint, p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.aanvragen
  set foto_upload_token = null
  where id = p_aanvraag_id and foto_upload_token = p_token;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.sluit_aanvraag_foto_upload(bigint, uuid) from public;
grant execute on function public.sluit_aanvraag_foto_upload(bigint, uuid) to anon, authenticated, service_role;

create or replace function public.publieke_tariefregels()
returns table (
  verhuurtype text,
  prijstype text,
  bedrag numeric,
  geldig_vanaf date,
  geldig_tot date
)
language sql
stable
security definer
set search_path = public
as $$
  select verhuurtype_sleutel, prijstype::text, bedrag, geldig_vanaf, geldig_tot
  from public.tarieven;
$$;

revoke all on function public.publieke_tariefregels() from public;
grant execute on function public.publieke_tariefregels() to anon, authenticated, service_role;

drop function if exists public.bewaar_test_aanvraag(text, text, text, text, text, date, date, text, text, text, text, text, boolean, boolean);

create or replace function public.bewaar_test_aanvraag(
  p_naam text,
  p_email text,
  p_telefoon text,
  p_adres text,
  p_verhuurtype text,
  p_start date,
  p_eind date,
  p_personen text,
  p_toelichting text,
  p_website text,
  p_eerder text,
  p_mede text,
  p_akkoord boolean,
  p_mailjob boolean default false,
  p_straat text default null,
  p_huisnummer text default null,
  p_toevoeging text default null,
  p_postcode text default null,
  p_woonplaats text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_relatie bigint;
  v_aantal integer;
  v_template bigint;
  v_job bigint;
  v_beschikbaar boolean;
  v_token uuid;
  v_mede text := btrim(coalesce(p_mede, ''));
  v_nieuw boolean := false;
begin
  if nullif(btrim(coalesce(p_naam, '')), '') is null then
    return jsonb_build_object('ok', false, 'fout', 'Naam ontbreekt.');
  end if;
  if nullif(btrim(coalesce(p_email, '')), '') is null or position('@' in p_email) = 0 then
    return jsonb_build_object('ok', false, 'fout', 'E-mailadres ontbreekt.');
  end if;
  if p_start is null then
    return jsonb_build_object('ok', false, 'fout', 'Startdatum ontbreekt.');
  end if;
  if p_eind is not null and p_eind < p_start then
    return jsonb_build_object('ok', false, 'fout', 'De einddatum ligt vóór de startdatum.');
  end if;
  if not exists (select 1 from public.verhuurtypen where sleutel = p_verhuurtype) then
    return jsonb_build_object('ok', false, 'fout', 'Onbekend verhuurtype.');
  end if;
  if v_mede <> '' and left(v_mede, 1) = '[' then
    begin
      if jsonb_typeof(v_mede::jsonb) <> 'array'
        or exists (select 1 from jsonb_array_elements(v_mede::jsonb) as item where jsonb_typeof(item) <> 'string') then
        return jsonb_build_object('ok', false, 'fout', 'De mede-exposanten zijn niet leesbaar.');
      end if;
      if (select count(*) from jsonb_array_elements_text(v_mede::jsonb) as naam where btrim(naam) <> '') > 4 then
        return jsonb_build_object('ok', false, 'fout', 'Je kunt maximaal 4 mede-exposanten toevoegen.');
      end if;
    exception
      when others then
        return jsonb_build_object('ok', false, 'fout', 'De mede-exposanten zijn niet leesbaar.');
    end;
  elsif position(E'\n' in v_mede) > 0
    and (select count(*) from regexp_split_to_table(v_mede, E'\n') as regel where btrim(regel) <> '') > 4 then
    return jsonb_build_object('ok', false, 'fout', 'Je kunt maximaal 4 mede-exposanten toevoegen.');
  end if;

  begin
    v_beschikbaar := public.is_periode_beschikbaar(p_start, coalesce(p_eind, p_start));
  exception
    when others then
      return jsonb_build_object('ok', false, 'fout', 'De beschikbaarheid kon niet worden gecontroleerd. De aanvraag is niet opgeslagen.');
  end;
  if v_beschikbaar is distinct from true then
    return jsonb_build_object('ok', false, 'fout', 'Deze periode is niet beschikbaar.');
  end if;

  select id into v_id
  from public.aanvragen
  where lower(email) = lower(btrim(p_email))
    and start_datum = p_start
    and status <> 'afgewezen'
  order by id
  limit 1;

  if v_id is null then
    select count(*) into v_aantal from public.relaties where lower(email) = lower(btrim(p_email));
    if v_aantal = 1 then
      select id into v_relatie from public.relaties where lower(email) = lower(btrim(p_email));
    end if;

    v_token := gen_random_uuid();
    v_nieuw := true;
    insert into public.aanvragen (
      status, binnengekomen_op, naam, email, telefoon, adres, straat, huisnummer, huisnummer_toevoeging, postcode, woonplaats,
      verhuurtype_sleutel, start_datum, eind_datum, aantal_personen, toelichting, website, eerder_geexposeerd,
      mede_exposanten, akkoord_voorwaarden, relatie_id, beoordeling_deadline, foto_upload_token
    ) values (
      'nieuw', now(), btrim(p_naam), lower(btrim(p_email)), nullif(btrim(coalesce(p_telefoon, '')), ''),
      nullif(btrim(coalesce(p_adres, '')), ''),
      nullif(btrim(coalesce(p_straat, '')), ''),
      nullif(btrim(coalesce(p_huisnummer, '')), ''),
      nullif(btrim(coalesce(p_toevoeging, '')), ''),
      nullif(btrim(coalesce(p_postcode, '')), ''),
      nullif(btrim(coalesce(p_woonplaats, '')), ''),
      p_verhuurtype, p_start, coalesce(p_eind, p_start),
      nullif(btrim(coalesce(p_personen, '')), ''), nullif(btrim(coalesce(p_toelichting, '')), ''),
      nullif(btrim(coalesce(p_website, '')), ''), nullif(btrim(coalesce(p_eerder, '')), ''),
      nullif(v_mede, ''), p_akkoord, v_relatie,
      (current_date + 7), v_token
    )
    returning id into v_id;

    insert into public.auditlog (actor_type, actor_naam, onderwerp_type, onderwerp_id, actie, naar, dedup_sleutel)
    values ('klant', btrim(p_naam), 'aanvraag', v_id::text, 'aangemaakt', 'nieuw', 'test-aanvraag:' || v_id::text);
  end if;

  if p_mailjob then
    select id into v_template from public.communicatie_templates where sleutel = 'booking_request_received';
    if v_template is null then
      return jsonb_build_object('ok', true, 'id', v_id, 'mailjob', 'template_ontbreekt')
        || case when v_nieuw then jsonb_build_object('foto_token', v_token) else '{}'::jsonb end;
    end if;
    insert into public.communicatie_jobs (
      aanvraag_id, template_id, template_sleutel, status, modus, gepland_op, dedup_sleutel, ontvanger_email, onderwerp
    ) values (
      v_id, v_template, 'booking_request_received', 'concept', 'concept', now(),
      'test:aanvraag:' || v_id::text || ':booking_request_received', lower(btrim(p_email)), ''
    )
    on conflict (dedup_sleutel) where dedup_sleutel is not null do nothing
    returning id into v_job;
    return jsonb_build_object('ok', true, 'id', v_id, 'mailjob', 'concept', 'job_id', v_job)
      || case when v_nieuw then jsonb_build_object('foto_token', v_token) else '{}'::jsonb end;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'mailjob', 'geen')
    || case when v_nieuw then jsonb_build_object('foto_token', v_token) else '{}'::jsonb end;
end;
$$;

revoke all on function public.bewaar_test_aanvraag(text, text, text, text, text, date, date, text, text, text, text, text, boolean, boolean, text, text, text, text, text) from public;
grant execute on function public.bewaar_test_aanvraag(text, text, text, text, text, date, date, text, text, text, text, text, boolean, boolean, text, text, text, text, text) to anon, authenticated, service_role;

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'aanvraag-fotos',
      'aanvraag-fotos',
      false,
      8000000,
      array['image/jpeg', 'image/png', 'image/webp']::text[]
    )
    on conflict (id) do update
      set public = false,
          file_size_limit = 8000000,
          allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[];

    drop policy if exists aanvraag_fotos_upload on storage.objects;
    create policy aanvraag_fotos_upload on storage.objects
      for insert to anon
      with check (
        bucket_id = 'aanvraag-fotos'
        and public.aanvraag_foto_pad_toegestaan(name)
      );

    drop policy if exists aanvraag_fotos_storage_lezen on storage.objects;
    create policy aanvraag_fotos_storage_lezen on storage.objects
      for select to authenticated
      using (
        bucket_id = 'aanvraag-fotos'
        and (select app.heeft_recht('aanvragen', 'lezen'))
      );
  end if;
end $$;

update public.verhuurtypen
set naam = 'Overige'
where sleutel = 'diverse'
  and naam in ('Diverse bijeenkomst', 'Diverse bijeenkomsten');

insert into public.instellingen (sleutel, groep, waarde, toelichting)
select
  'extra_ontvangst_adres',
  'mail',
  to_jsonb(r.email),
  'Extra intern ontvangstadres voor nieuwe aanvragen'
from public.relaties r
join public.relatie_rollen rr on rr.relatie_id = r.id
where rr.rol = 'voorzitter'
  and coalesce(rr.actief, true)
  and nullif(btrim(r.email), '') is not null
order by r.id
limit 1
on conflict (sleutel) do nothing;

create or replace function public._vervang_expositiebegeleider(p_tekst text)
returns text
language plpgsql
immutable
as $$
declare
  v text := coalesce(p_tekst, '');
begin
  v := replace(v, '{{gastheer_naam}}', '{{__GH_NAAM__}}');
  v := replace(v, '{{gastheer_telefoon}}', '{{__GH_TEL__}}');
  v := replace(v, 'Gastheer of gastvrouw', 'Expositiebegeleider');
  v := replace(v, 'gastheer of gastvrouw', 'expositiebegeleider');
  v := replace(v, 'Gastheer/gastvrouw', 'Expositiebegeleider');
  v := replace(v, 'Gastheer ontbreekt', 'Expositiebegeleider ontbreekt');
  v := replace(v, 'Gastheer nodig', 'Expositiebegeleider nodig');
  v := replace(v, 'Gastheer toewijzen', 'Expositiebegeleider toewijzen');
  v := replace(v, 'Gastheer bevestigd', 'Expositiebegeleider bevestigd');
  v := replace(v, 'Beschikbaarheid gastheer', 'Beschikbaarheid expositiebegeleider');
  v := replace(v, 'informatie gastheer', 'informatie expositiebegeleider');
  v := replace(v, 'Bevestigd: gastheer', 'Bevestigd: expositiebegeleider');
  v := replace(v, 'Wijs een gastheer', 'Wijs een expositiebegeleider');
  v := replace(v, 'als gastheer', 'als expositiebegeleider');
  v := replace(v, 'gastheer zijn', 'expositiebegeleider zijn');
  v := replace(v, 'ben je gastheer', 'ben je expositiebegeleider');
  v := replace(v, 'geen gastheer', 'geen expositiebegeleider');
  v := replace(v, 'nodigt gastheer', 'nodigt expositiebegeleider');
  v := replace(v, '{{__GH_NAAM__}}', '{{gastheer_naam}}');
  v := replace(v, '{{__GH_TEL__}}', '{{gastheer_telefoon}}');
  return v;
end;
$$;

update public.communicatie_templates
set naam = public._vervang_expositiebegeleider(naam)
where naam ilike '%gastheer%';

do $$
declare
  v_type text;
begin
  select data_type into v_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'communicatie_template_versies'
    and column_name = 'inhoud';
  if v_type = 'jsonb' then
    update public.communicatie_template_versies
    set onderwerp = public._vervang_expositiebegeleider(onderwerp),
        inhoud = public._vervang_expositiebegeleider(inhoud::text)::jsonb
    where onderwerp ilike '%gastheer%' or inhoud::text ilike '%gastheer%';
  else
    update public.communicatie_template_versies
    set onderwerp = public._vervang_expositiebegeleider(onderwerp),
        inhoud = public._vervang_expositiebegeleider(inhoud::text)
    where onderwerp ilike '%gastheer%' or inhoud::text ilike '%gastheer%';
  end if;
end $$;

drop function public._vervang_expositiebegeleider(text);
