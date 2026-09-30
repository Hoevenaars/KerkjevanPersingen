-- Eenrichtingsbridge Sanity naar Supabase. Lege schaduw verandert de bezetting niet.
-- Geen mail, geen job, geen token, geen schrijven naar Sanity.

create table if not exists public.sanity_bridge_agenda (
  id bigint generated always as identity primary key,
  sanity_id text not null unique,
  datum_start date,
  datum_eind date,
  status text,
  soort text,
  titel_intern text,
  sanity_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  source_hash text not null,
  actief boolean not null default true,
  blokkeert boolean not null default false,
  sync_status text not null,
  sync_error text
);

create table if not exists public.bridge_sync_log (
  id bigint generated always as identity primary key,
  sanity_document_id text not null,
  document_type text not null,
  action text not null,
  received_at timestamptz not null default now(),
  synced_at timestamptz,
  status text not null check (status in ('success', 'skipped', 'review', 'error')),
  target_table text,
  target_id text,
  error text,
  source_updated_at timestamptz,
  source_hash text
);

alter table public.sanity_bridge_agenda enable row level security;
alter table public.bridge_sync_log enable row level security;
revoke all on table public.sanity_bridge_agenda from anon, authenticated;
revoke all on table public.bridge_sync_log from anon, authenticated;

create or replace function public.publieke_bezetting()
returns table (start_datum date, eind_datum date, soort text)
language sql
stable
security definer
set search_path = public
as $$
  select b.start_datum, b.eind_datum, coalesce(b.verhuurtype_sleutel, '')
  from public.boekingen b
  where b.status in ('optie', 'definitief', 'migratie_vastgelegd', 'optie_verlopen')
  union all
  select i.start_datum, i.eind_datum, 'blokkade'
  from public.interne_activiteiten i
  where i.blokkeert_verhuurkalender
  union all
  select a.start_datum, a.eind_datum, coalesce(a.soort, '')
  from public.activiteit_bron a
  where a.zichtbaarheid in ('publiek', 'bezet')
    and a.start_datum is not null
    and a.eind_datum is not null
    and not exists (
      select 1 from public.boekingen b
      where b.status in ('optie', 'definitief', 'migratie_vastgelegd', 'optie_verlopen')
        and b.start_datum <= a.eind_datum
        and b.eind_datum >= a.start_datum
    )
  union all
  select s.datum_start, s.datum_eind, coalesce(s.soort, '')
  from public.sanity_bridge_agenda s
  where s.actief
    and s.blokkeert
    and s.datum_start is not null
    and s.datum_eind is not null
$$;

revoke all on function public.publieke_bezetting() from public;
grant execute on function public.publieke_bezetting() to anon, authenticated, service_role;

create or replace function public.pas_sanity_bridge(p_stappen jsonb, p_log jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  stap jsonb;
  stap_soort text;
  stap_sanity_id text;
  velden jsonb;
  doel_id text;
begin
  if p_stappen is not null then
    for stap in select value from jsonb_array_elements(p_stappen)
    loop
      stap_soort := stap->>'soort';
      stap_sanity_id := stap->>'sanityId';
      velden := stap->'velden';
      if stap_soort = 'shadow' then
        insert into public.sanity_bridge_agenda (
          sanity_id, datum_start, datum_eind, status, soort, titel_intern,
          sanity_updated_at, source_hash, actief, blokkeert, sync_status
        ) values (
          stap_sanity_id,
          nullif(velden->>'start', '')::date,
          nullif(velden->>'eind', '')::date,
          velden->>'zichtbaarheid',
          velden->>'soort',
          velden->>'titel',
          nullif(velden->>'updatedAt', '')::timestamptz,
          velden->>'hash',
          coalesce((velden->>'actief')::boolean, true),
          coalesce((velden->>'blokkeert')::boolean, false),
          'success'
        )
        on conflict (sanity_id) do update set
          datum_start = coalesce(excluded.datum_start, public.sanity_bridge_agenda.datum_start),
          datum_eind = coalesce(excluded.datum_eind, public.sanity_bridge_agenda.datum_eind),
          status = excluded.status,
          soort = excluded.soort,
          titel_intern = excluded.titel_intern,
          sanity_updated_at = excluded.sanity_updated_at,
          source_hash = excluded.source_hash,
          actief = excluded.actief,
          blokkeert = excluded.blokkeert,
          sync_status = 'success',
          sync_error = null,
          synced_at = now();
        doel_id := stap_sanity_id;
      elsif stap_soort = 'bron' then
        update public.activiteit_bron
        set zichtbaarheid = velden->>'zichtbaarheid',
            soort = velden->>'soort',
            titel = velden->>'titel',
            interne_titel = velden->>'interneTitel',
            slug = velden->>'slug',
            start_datum = coalesce(nullif(velden->>'start', '')::date, start_datum),
            eind_datum = coalesce(nullif(velden->>'eind', '')::date, eind_datum)
        where legacy_source = 'sanity' and legacy_id = stap_sanity_id;
        doel_id := stap_sanity_id;
      elsif stap_soort = 'publiek' then
        update public.publieke_activiteiten
        set titel = velden->>'titel',
            slug = coalesce(nullif(velden->>'slug', ''), slug),
            start_datum = coalesce(nullif(velden->>'start', '')::date, start_datum),
            eind_datum = coalesce(nullif(velden->>'eind', '')::date, eind_datum),
            omschrijving = velden->>'omschrijving',
            zichtbaarheid = velden->>'zichtbaarheid',
            gepubliceerd = coalesce((velden->>'gepubliceerd')::boolean, false)
        where legacy_source = 'sanity' and legacy_id = stap_sanity_id;
        if not found and coalesce((velden->>'gepubliceerd')::boolean, false) then
          insert into public.publieke_activiteiten (
            titel, slug, start_datum, eind_datum, omschrijving, zichtbaarheid, gepubliceerd, legacy_source, legacy_id
          ) values (
            velden->>'titel',
            nullif(velden->>'slug', ''),
            (velden->>'start')::date,
            coalesce(nullif(velden->>'eind', '')::date, (velden->>'start')::date),
            velden->>'omschrijving',
            'publiek',
            true,
            'sanity',
            stap_sanity_id
          );
        end if;
        doel_id := stap_sanity_id;
      elsif stap_soort = 'intern' then
        update public.interne_activiteiten
        set titel = velden->>'titel',
            start_datum = coalesce(nullif(velden->>'start', '')::date, start_datum),
            eind_datum = coalesce(nullif(velden->>'eind', '')::date, eind_datum),
            blokkeert_verhuurkalender = coalesce((velden->>'blokkeert')::boolean, false)
        where legacy_source = 'sanity' and legacy_id = stap_sanity_id;
        doel_id := stap_sanity_id;
      elsif stap_soort = 'vriend' then
        update public.vrienden
        set naam = velden->>'naam',
            email = velden->>'email',
            actief = coalesce((velden->>'actief')::boolean, false),
            frequentie = coalesce(velden->>'frequentie', 'wekelijks')::public.vriend_frequentie
        where legacy_source = 'sanity' and legacy_id = stap_sanity_id;
        if not found then
          insert into public.vrienden (naam, email, actief, frequentie, uitschrijf_token, legacy_source, legacy_id)
          values (
            velden->>'naam',
            velden->>'email',
            coalesce((velden->>'actief')::boolean, true),
            coalesce(velden->>'frequentie', 'wekelijks')::public.vriend_frequentie,
            gen_random_uuid()::text,
            'sanity',
            stap_sanity_id
          );
        end if;
        doel_id := stap_sanity_id;
      elsif stap_soort = 'nieuwsbrief' then
        update public.nieuwsbrieven
        set week_maandag = coalesce(nullif(velden->>'week', '')::date, week_maandag),
            kort_nieuws = velden->>'kortNieuws',
            donatie_update = velden->>'donatieUpdate',
            overgeslagen = coalesce((velden->>'overgeslagen')::boolean, false)
        where legacy_source = 'sanity' and legacy_id = stap_sanity_id;
        if not found and nullif(velden->>'week', '') is not null then
          insert into public.nieuwsbrieven (
            week_maandag, kort_nieuws, donatie_update, overgeslagen, verstuurd, legacy_source, legacy_id
          ) values (
            (velden->>'week')::date,
            velden->>'kortNieuws',
            velden->>'donatieUpdate',
            coalesce((velden->>'overgeslagen')::boolean, false),
            false,
            'sanity',
            stap_sanity_id
          );
        end if;
        doel_id := stap_sanity_id;
      elsif stap_soort = 'aanvraag' then
        update public.aanvragen
        set naam = velden->>'naam',
            email = velden->>'email',
            telefoon = velden->>'telefoon',
            status = (velden->>'status')::public.aanvraag_status,
            start_datum = nullif(velden->>'start', '')::date,
            eind_datum = nullif(velden->>'eind', '')::date,
            verhuurtype_sleutel = nullif(velden->>'soort', '')
        where legacy_source = 'sanity' and legacy_id = stap_sanity_id;
        if not found then
          insert into public.aanvragen (naam, email, telefoon, status, start_datum, eind_datum, verhuurtype_sleutel, legacy_source, legacy_id)
          values (
            velden->>'naam',
            velden->>'email',
            velden->>'telefoon',
            (velden->>'status')::public.aanvraag_status,
            nullif(velden->>'start', '')::date,
            nullif(velden->>'eind', '')::date,
            nullif(velden->>'soort', ''),
            'sanity',
            stap_sanity_id
          );
        end if;
        doel_id := stap_sanity_id;
      else
        raise exception 'onbekende bridgestap %', stap_soort;
      end if;
    end loop;
  end if;

  insert into public.bridge_sync_log (
    sanity_document_id, document_type, action, synced_at, status, target_table, target_id, error, source_updated_at, source_hash
  ) values (
    p_log->>'sanityId',
    p_log->>'documentType',
    p_log->>'action',
    now(),
    p_log->>'status',
    p_log->>'targetTable',
    coalesce(doel_id, p_log->>'targetId'),
    p_log->>'error',
    nullif(p_log->>'sourceUpdatedAt', '')::timestamptz,
    p_log->>'sourceHash'
  );
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.pas_sanity_bridge(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.pas_sanity_bridge(jsonb, jsonb) to service_role;
