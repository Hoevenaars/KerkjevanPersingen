-- Activiteitbeheer: annulering, contentstatus, publicatiestatus en lokale overrides.
-- Bestaande rijen blijven actief. contentstatus blijft leeg, zodat de huidige agenda niet verschuift.
-- Geen mail, geen communicatiejob, geen workflow, geen delete.

alter table public.publieke_activiteiten
  add column if not exists korte_omschrijving text,
  add column if not exists volledige_omschrijving text,
  add column if not exists exposanten text,
  add column if not exists aanvullende_afbeeldingen jsonb not null default '[]'::jsonb,
  add column if not exists contentstatus text,
  add column if not exists levenscyclus text not null default 'actief',
  add column if not exists geannuleerd_op timestamptz,
  add column if not exists geannuleerd_door text,
  add column if not exists annuleringsreden text,
  add column if not exists lokale_override jsonb not null default '{}'::jsonb;

alter table public.activiteit_bron
  add column if not exists contentstatus text,
  add column if not exists levenscyclus text not null default 'actief',
  add column if not exists geannuleerd_op timestamptz,
  add column if not exists geannuleerd_door text,
  add column if not exists annuleringsreden text,
  add column if not exists lokale_override jsonb not null default '{}'::jsonb;

alter table public.sanity_bridge_agenda
  add column if not exists levenscyclus text not null default 'actief';

alter table public.publieke_activiteiten drop constraint if exists publieke_activiteiten_contentstatus_check;
alter table public.publieke_activiteiten
  add constraint publieke_activiteiten_contentstatus_check
  check (contentstatus is null or contentstatus in ('niet_aangeleverd', 'aangeleverd', 'in_beoordeling', 'goedgekeurd', 'aanpassing_nodig'));

alter table public.publieke_activiteiten drop constraint if exists publieke_activiteiten_levenscyclus_check;
alter table public.publieke_activiteiten
  add constraint publieke_activiteiten_levenscyclus_check
  check (levenscyclus in ('actief', 'geannuleerd'));

alter table public.activiteit_bron drop constraint if exists activiteit_bron_contentstatus_check;
alter table public.activiteit_bron
  add constraint activiteit_bron_contentstatus_check
  check (contentstatus is null or contentstatus in ('niet_aangeleverd', 'aangeleverd', 'in_beoordeling', 'goedgekeurd', 'aanpassing_nodig'));

alter table public.activiteit_bron drop constraint if exists activiteit_bron_levenscyclus_check;
alter table public.activiteit_bron
  add constraint activiteit_bron_levenscyclus_check
  check (levenscyclus in ('actief', 'geannuleerd'));

alter table public.sanity_bridge_agenda drop constraint if exists sanity_bridge_agenda_levenscyclus_check;
alter table public.sanity_bridge_agenda
  add constraint sanity_bridge_agenda_levenscyclus_check
  check (levenscyclus in ('actief', 'geannuleerd'));

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
    and coalesce(a.levenscyclus, 'actief') <> 'geannuleerd'
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
    and coalesce(s.levenscyclus, 'actief') <> 'geannuleerd'
    and s.datum_start is not null
    and s.datum_eind is not null
$$;

revoke all on function public.publieke_bezetting() from public;
grant execute on function public.publieke_bezetting() to anon, authenticated, service_role;

drop function if exists public.publieke_agenda();

create function public.publieke_agenda()
returns table (
  id bigint,
  slug text,
  titel text,
  start_datum date,
  eind_datum date,
  omschrijving text,
  korte_omschrijving text,
  volledige_omschrijving text,
  foto_pad text,
  foto_alt text,
  aanvullende_afbeeldingen jsonb,
  exposanten text,
  praktische_informatie text,
  publicatie_trigger text,
  zichtbaarheid text,
  inhoud_status text,
  contentstatus text,
  soort text,
  levenscyclus text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.slug,
    p.titel,
    p.start_datum,
    p.eind_datum,
    p.omschrijving,
    p.korte_omschrijving,
    p.volledige_omschrijving,
    p.foto_pad,
    p.foto_alt,
    p.aanvullende_afbeeldingen,
    p.exposanten,
    p.praktische_informatie,
    p.publicatie_trigger::text,
    p.zichtbaarheid,
    p.inhoud_status::text,
    p.contentstatus,
    coalesce(b.verhuurtype_sleutel, a.soort, 'expositie'),
    p.levenscyclus
  from public.publieke_activiteiten p
  left join public.boekingen b on b.id = p.boeking_id
  left join public.activiteit_bron a on a.legacy_id = p.legacy_id
  where p.zichtbaarheid = 'publiek'
    and coalesce(p.levenscyclus, 'actief') <> 'geannuleerd'
    and p.eind_datum >= (timezone('Europe/Amsterdam', now()))::date
    and p.publicatie_trigger is distinct from 'niet_publiceren'
    and (
      p.contentstatus is null
      or (
        p.contentstatus = 'goedgekeurd'
        and (
          coalesce(b.verhuurtype_sleutel, a.soort, 'expositie') <> 'expositie'
          or (
            nullif(btrim(p.titel), '') is not null
            and nullif(btrim(p.korte_omschrijving), '') is not null
            and nullif(btrim(p.volledige_omschrijving), '') is not null
            and nullif(btrim(p.foto_pad), '') is not null
          )
        )
      )
    )
  order by p.start_datum
$$;

revoke all on function public.publieke_agenda() from public;
grant execute on function public.publieke_agenda() to anon, authenticated, service_role;

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
  v_override jsonb;
  v_leven text;
  v_lock_annulering boolean;
  v_lock_publicatie boolean;
  v_lock_content boolean;
  v_lock_timing boolean;
  v_lock_velden boolean;
  v_zicht text;
  v_gepubliceerd boolean;
  v_trigger text;
begin
  if p_stappen is not null then
    for stap in select value from jsonb_array_elements(p_stappen)
    loop
      stap_soort := stap->>'soort';
      stap_sanity_id := stap->>'sanityId';
      velden := stap->'velden';
      v_override := '{}'::jsonb;
      v_leven := 'actief';
      v_lock_annulering := false;
      v_lock_publicatie := false;
      v_lock_content := false;
      v_lock_timing := false;
      v_lock_velden := false;

      if stap_soort = 'shadow' then
        select
          exists (
            select 1 from public.publieke_activiteiten p
            where p.legacy_source = 'sanity' and p.legacy_id = stap_sanity_id
              and (p.levenscyclus = 'geannuleerd' or coalesce(p.lokale_override, '{}'::jsonb) ? 'annulering')
          )
          or exists (
            select 1 from public.activiteit_bron a
            where a.legacy_source = 'sanity' and a.legacy_id = stap_sanity_id
              and (a.levenscyclus = 'geannuleerd' or coalesce(a.lokale_override, '{}'::jsonb) ? 'annulering')
          )
        into v_lock_annulering;
        insert into public.sanity_bridge_agenda (
          sanity_id, datum_start, datum_eind, status, soort, titel_intern,
          sanity_updated_at, source_hash, actief, blokkeert, sync_status, levenscyclus
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
          case when v_lock_annulering then false else coalesce((velden->>'blokkeert')::boolean, false) end,
          'success',
          case when v_lock_annulering or velden->>'levenscyclus' = 'geannuleerd' then 'geannuleerd' else 'actief' end
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
          blokkeert = case when v_lock_annulering then false else excluded.blokkeert end,
          levenscyclus = case when v_lock_annulering or excluded.levenscyclus = 'geannuleerd' then 'geannuleerd' else public.sanity_bridge_agenda.levenscyclus end,
          sync_status = 'success',
          sync_error = null,
          synced_at = now();
        doel_id := stap_sanity_id;
      elsif stap_soort = 'bron' then
        select coalesce(lokale_override, '{}'::jsonb), coalesce(levenscyclus, 'actief')
          into v_override, v_leven
        from public.activiteit_bron
        where legacy_source = 'sanity' and legacy_id = stap_sanity_id;
        v_lock_annulering := coalesce(v_leven, 'actief') = 'geannuleerd' or coalesce(v_override, '{}'::jsonb) ? 'annulering';
        v_lock_publicatie := coalesce(v_override, '{}'::jsonb) ? 'publicatiestatus';
        update public.activiteit_bron
        set zichtbaarheid = case
              when v_lock_annulering or v_lock_publicatie or nullif(velden->>'zichtbaarheid', '') is null then zichtbaarheid
              else velden->>'zichtbaarheid'
            end,
            soort = coalesce(velden->>'soort', soort),
            titel = coalesce(velden->>'titel', titel),
            interne_titel = coalesce(velden->>'interneTitel', interne_titel),
            slug = coalesce(velden->>'slug', slug),
            start_datum = coalesce(nullif(velden->>'start', '')::date, start_datum),
            eind_datum = coalesce(nullif(velden->>'eind', '')::date, eind_datum),
            levenscyclus = case when v_lock_annulering or velden->>'levenscyclus' = 'geannuleerd' then 'geannuleerd' else levenscyclus end
        where legacy_source = 'sanity' and legacy_id = stap_sanity_id;
        doel_id := stap_sanity_id;
      elsif stap_soort = 'publiek' then
        select coalesce(lokale_override, '{}'::jsonb), coalesce(levenscyclus, 'actief')
          into v_override, v_leven
        from public.publieke_activiteiten
        where legacy_source = 'sanity' and legacy_id = stap_sanity_id;
        v_lock_annulering := coalesce(v_leven, 'actief') = 'geannuleerd' or coalesce(v_override, '{}'::jsonb) ? 'annulering';
        v_lock_publicatie := coalesce(v_override, '{}'::jsonb) ? 'publicatiestatus';
        v_lock_content := coalesce(v_override, '{}'::jsonb) ? 'contentstatus';
        v_lock_timing := coalesce(v_override, '{}'::jsonb) ? 'publicatietiming';
        v_lock_velden := coalesce(v_override, '{}'::jsonb) ? 'contentvelden';
        v_zicht := case
          when v_lock_annulering or v_lock_publicatie then null
          else nullif(velden->>'zichtbaarheid', '')
        end;
        v_gepubliceerd := case
          when v_lock_annulering then false
          when v_lock_publicatie then null
          else coalesce((velden->>'gepubliceerd')::boolean, false)
        end;
        v_trigger := case
          when v_lock_timing then null
          else nullif(velden->>'publicatieTrigger', '')
        end;
        update public.publieke_activiteiten
        set titel = case when v_lock_velden then titel else coalesce(velden->>'titel', titel) end,
            slug = coalesce(nullif(velden->>'slug', ''), slug),
            start_datum = coalesce(nullif(velden->>'start', '')::date, start_datum),
            eind_datum = coalesce(nullif(velden->>'eind', '')::date, eind_datum),
            omschrijving = case when v_lock_velden then omschrijving else velden->>'omschrijving' end,
            zichtbaarheid = coalesce(v_zicht, zichtbaarheid),
            gepubliceerd = coalesce(v_gepubliceerd, gepubliceerd),
            contentstatus = case
              when v_lock_content or nullif(velden->>'contentstatus', '') is null then contentstatus
              else velden->>'contentstatus'
            end,
            publicatie_trigger = case
              when v_trigger is null then publicatie_trigger
              else v_trigger::public.publicatie_trigger
            end,
            levenscyclus = case when v_lock_annulering or velden->>'levenscyclus' = 'geannuleerd' then 'geannuleerd' else levenscyclus end
        where legacy_source = 'sanity' and legacy_id = stap_sanity_id;
        if not found and not v_lock_annulering and coalesce((velden->>'gepubliceerd')::boolean, false) then
          insert into public.publieke_activiteiten (
            titel, slug, start_datum, eind_datum, omschrijving, zichtbaarheid, gepubliceerd, legacy_source, legacy_id, contentstatus, publicatie_trigger
          ) values (
            velden->>'titel',
            nullif(velden->>'slug', ''),
            (velden->>'start')::date,
            coalesce(nullif(velden->>'eind', '')::date, (velden->>'start')::date),
            velden->>'omschrijving',
            'publiek',
            true,
            'sanity',
            stap_sanity_id,
            nullif(velden->>'contentstatus', ''),
            coalesce(nullif(velden->>'publicatieTrigger', '')::public.publicatie_trigger, 'zodra_content_compleet')
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
      elsif stap_soort = 'conflict' then
        insert into public.auditlog (
          actor_type, actor_naam, onderwerp_type, onderwerp_id, actie, van, naar, reden, details, dedup_sleutel
        ) values (
          'systeem',
          'Sanity-bridge',
          'activiteit',
          stap_sanity_id,
          'bridge_conflict',
          velden->>'lokaal',
          velden->>'inkomend',
          'lokale override behouden',
          velden,
          'bridge-conflict:' || stap_sanity_id || ':' || coalesce(velden->>'veld', '') || ':' || left(coalesce(velden->>'hash', ''), 16)
        )
        on conflict (dedup_sleutel) where dedup_sleutel is not null do nothing;
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
  return jsonb_build_object('ok', true, 'mail', false, 'workflow', false);
end;
$$;

revoke all on function public.pas_sanity_bridge(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.pas_sanity_bridge(jsonb, jsonb) to service_role;

create or replace function public.beheer_activiteit_mutatie(
  p_tabel text,
  p_id bigint,
  p_actie text,
  p_payload jsonb,
  p_actor_naam text,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_legacy text;
  v_van_status text;
  v_van_publicatie text;
  v_van_content text;
  v_reden text;
  v_status text;
  v_content text;
  v_trigger text;
  v_jobs integer;
begin
  if p_tabel not in ('publieke_activiteiten', 'activiteit_bron') then
    return jsonb_build_object('ok', false, 'melding', 'Onbekende activiteitabel.', 'mail', false, 'workflow', false, 'jobs', 0);
  end if;
  v_jobs := (select count(*) from public.communicatie_jobs);

  if p_tabel = 'publieke_activiteiten' then
    select legacy_id, levenscyclus, zichtbaarheid, contentstatus
      into v_legacy, v_van_status, v_van_publicatie, v_van_content
    from public.publieke_activiteiten where id = p_id;
  else
    select legacy_id, levenscyclus, zichtbaarheid, contentstatus
      into v_legacy, v_van_status, v_van_publicatie, v_van_content
    from public.activiteit_bron where id = p_id;
  end if;
  if v_van_status is null then
    return jsonb_build_object('ok', false, 'melding', 'Activiteit niet gevonden.', 'mail', false, 'workflow', false, 'jobs', 0);
  end if;

  if p_actie = 'annuleer' then
    if v_van_status = 'geannuleerd' then
      return jsonb_build_object('ok', true, 'melding', 'De activiteit was al geannuleerd.', 'mail', false, 'workflow', false, 'jobs', 0);
    end if;
    v_reden := nullif(btrim(coalesce(p_payload->>'reden', '')), '');
    if p_tabel = 'publieke_activiteiten' then
      update public.publieke_activiteiten
      set levenscyclus = 'geannuleerd',
          geannuleerd_op = now(),
          geannuleerd_door = nullif(btrim(coalesce(p_actor_naam, '')), ''),
          annuleringsreden = v_reden,
          gepubliceerd = false,
          lokale_override = coalesce(lokale_override, '{}'::jsonb) || jsonb_build_object('annulering', true)
      where id = p_id;
    else
      update public.activiteit_bron
      set levenscyclus = 'geannuleerd',
          geannuleerd_op = now(),
          geannuleerd_door = nullif(btrim(coalesce(p_actor_naam, '')), ''),
          annuleringsreden = v_reden,
          lokale_override = coalesce(lokale_override, '{}'::jsonb) || jsonb_build_object('annulering', true)
      where id = p_id;
    end if;
    if v_legacy is not null then
      update public.publieke_activiteiten
      set levenscyclus = 'geannuleerd', gepubliceerd = false,
          geannuleerd_op = coalesce(geannuleerd_op, now()),
          geannuleerd_door = coalesce(geannuleerd_door, nullif(btrim(coalesce(p_actor_naam, '')), '')),
          annuleringsreden = coalesce(annuleringsreden, v_reden),
          lokale_override = coalesce(lokale_override, '{}'::jsonb) || jsonb_build_object('annulering', true)
      where legacy_source = 'sanity' and legacy_id = v_legacy and levenscyclus is distinct from 'geannuleerd';
      update public.activiteit_bron
      set levenscyclus = 'geannuleerd',
          geannuleerd_op = coalesce(geannuleerd_op, now()),
          geannuleerd_door = coalesce(geannuleerd_door, nullif(btrim(coalesce(p_actor_naam, '')), '')),
          annuleringsreden = coalesce(annuleringsreden, v_reden),
          lokale_override = coalesce(lokale_override, '{}'::jsonb) || jsonb_build_object('annulering', true)
      where legacy_source = 'sanity' and legacy_id = v_legacy and levenscyclus is distinct from 'geannuleerd';
      update public.sanity_bridge_agenda
      set blokkeert = false, levenscyclus = 'geannuleerd'
      where sanity_id = v_legacy;
    end if;
    insert into public.auditlog (actor_id, actor_type, actor_naam, onderwerp_type, onderwerp_id, actie, van, naar, reden, dedup_sleutel)
    values (
      p_actor_id, 'gebruiker', nullif(btrim(coalesce(p_actor_naam, '')), ''),
      'activiteit', p_tabel || ':' || p_id::text, 'activiteit_annuleren', v_van_status, 'geannuleerd', v_reden,
      'annuleer:' || p_tabel || ':' || p_id::text
    );
  elsif p_actie = 'publicatiestatus' then
    if v_van_status = 'geannuleerd' then
      return jsonb_build_object('ok', false, 'melding', 'Een geannuleerde activiteit wordt niet opnieuw gepubliceerd.', 'mail', false, 'workflow', false, 'jobs', 0);
    end if;
    v_status := p_payload->>'publicatiestatus';
    if v_status not in ('publiek', 'bezet', 'verborgen') then
      return jsonb_build_object('ok', false, 'melding', 'Onbekende publicatiestatus.', 'mail', false, 'workflow', false, 'jobs', 0);
    end if;
    if p_tabel = 'publieke_activiteiten' then
      update public.publieke_activiteiten
      set zichtbaarheid = v_status,
          lokale_override = coalesce(lokale_override, '{}'::jsonb) || jsonb_build_object('publicatiestatus', v_status)
      where id = p_id;
    else
      update public.activiteit_bron
      set zichtbaarheid = v_status,
          lokale_override = coalesce(lokale_override, '{}'::jsonb) || jsonb_build_object('publicatiestatus', v_status)
      where id = p_id;
    end if;
    if v_legacy is not null then
      update public.activiteit_bron
      set zichtbaarheid = v_status,
          lokale_override = coalesce(lokale_override, '{}'::jsonb) || jsonb_build_object('publicatiestatus', v_status)
      where legacy_source = 'sanity' and legacy_id = v_legacy;
      update public.publieke_activiteiten
      set zichtbaarheid = v_status,
          lokale_override = coalesce(lokale_override, '{}'::jsonb) || jsonb_build_object('publicatiestatus', v_status)
      where legacy_source = 'sanity' and legacy_id = v_legacy;
      update public.sanity_bridge_agenda
      set blokkeert = v_status in ('publiek', 'bezet')
      where sanity_id = v_legacy and levenscyclus is distinct from 'geannuleerd';
    end if;
    if v_van_publicatie is distinct from v_status then
      insert into public.auditlog (actor_id, actor_type, actor_naam, onderwerp_type, onderwerp_id, actie, van, naar, dedup_sleutel)
      values (
        p_actor_id, 'gebruiker', nullif(btrim(coalesce(p_actor_naam, '')), ''),
        'activiteit', p_tabel || ':' || p_id::text, 'publicatiestatus', v_van_publicatie, v_status,
        'publicatie:' || p_tabel || ':' || p_id::text || ':' || v_status
      );
    end if;
  elsif p_actie = 'contentstatus' then
    v_content := p_payload->>'contentstatus';
    if v_content not in ('niet_aangeleverd', 'aangeleverd', 'in_beoordeling', 'goedgekeurd', 'aanpassing_nodig') then
      return jsonb_build_object('ok', false, 'melding', 'Onbekende contentstatus.', 'mail', false, 'workflow', false, 'jobs', 0);
    end if;
    if p_tabel = 'publieke_activiteiten' then
      update public.publieke_activiteiten
      set contentstatus = v_content,
          lokale_override = coalesce(lokale_override, '{}'::jsonb) || jsonb_build_object('contentstatus', v_content)
      where id = p_id;
    else
      update public.activiteit_bron
      set contentstatus = v_content,
          lokale_override = coalesce(lokale_override, '{}'::jsonb) || jsonb_build_object('contentstatus', v_content)
      where id = p_id;
    end if;
    if v_van_content is distinct from v_content then
      insert into public.auditlog (actor_id, actor_type, actor_naam, onderwerp_type, onderwerp_id, actie, van, naar, dedup_sleutel)
      values (
        p_actor_id, 'gebruiker', nullif(btrim(coalesce(p_actor_naam, '')), ''),
        'activiteit', p_tabel || ':' || p_id::text, 'contentstatus', v_van_content, v_content,
        'content:' || p_tabel || ':' || p_id::text || ':' || v_content
      );
    end if;
  elsif p_actie = 'bewaar' then
    v_status := nullif(p_payload->>'publicatiestatus', '');
    v_content := nullif(p_payload->>'contentstatus', '');
    v_trigger := nullif(p_payload->>'publicatie_trigger', '');
    if p_tabel = 'publieke_activiteiten' then
      update public.publieke_activiteiten
      set titel = coalesce(nullif(p_payload->>'titel', ''), titel),
          start_datum = coalesce(nullif(p_payload->>'start', '')::date, start_datum),
          eind_datum = coalesce(nullif(p_payload->>'eind', '')::date, eind_datum),
          exposanten = p_payload->>'exposanten',
          korte_omschrijving = p_payload->>'korte_omschrijving',
          volledige_omschrijving = p_payload->>'volledige_omschrijving',
          praktische_informatie = p_payload->>'praktische_informatie',
          foto_pad = nullif(p_payload->>'foto_pad', ''),
          aanvullende_afbeeldingen = case
            when p_payload ? 'aanvullende' then coalesce(p_payload->'aanvullende', '[]'::jsonb)
            else aanvullende_afbeeldingen
          end,
          zichtbaarheid = coalesce(v_status, zichtbaarheid),
          contentstatus = coalesce(v_content, contentstatus),
          publicatie_trigger = case
            when p_payload->>'publicatie_trigger' = 'direct' then 'zodra_content_compleet'::public.publicatie_trigger
            when v_trigger is null or v_trigger not in (
              'zodra_content_compleet', 'uiterlijk_1_maand', 'uiterlijk_2_maanden', 'uiterlijk_3_maanden',
              'uiterlijk_6_maanden', 'uiterlijk_9_maanden', 'uiterlijk_12_maanden', 'niet_publiceren'
            ) then publicatie_trigger
            else v_trigger::public.publicatie_trigger
          end,
          lokale_override = coalesce(lokale_override, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
            'contentvelden', true,
            'publicatiestatus', v_status,
            'contentstatus', v_content,
            'publicatietiming', case when p_payload ? 'publicatie_trigger' then true else null end
          ))
      where id = p_id;
    else
      update public.activiteit_bron
      set titel = coalesce(nullif(p_payload->>'titel', ''), titel),
          soort = coalesce(nullif(p_payload->>'soort', ''), soort),
          start_datum = coalesce(nullif(p_payload->>'start', '')::date, start_datum),
          eind_datum = coalesce(nullif(p_payload->>'eind', '')::date, eind_datum),
          zichtbaarheid = coalesce(v_status, zichtbaarheid),
          contentstatus = coalesce(v_content, contentstatus),
          publicatie_trigger = case
            when p_payload->>'publicatie_trigger' = 'direct' then 'zodra_content_compleet'::public.publicatie_trigger
            when v_trigger is null or v_trigger not in (
              'zodra_content_compleet', 'uiterlijk_1_maand', 'uiterlijk_2_maanden', 'uiterlijk_3_maanden',
              'uiterlijk_6_maanden', 'uiterlijk_9_maanden', 'uiterlijk_12_maanden', 'niet_publiceren'
            ) then publicatie_trigger
            else v_trigger::public.publicatie_trigger
          end,
          lokale_override = coalesce(lokale_override, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
            'publicatiestatus', v_status,
            'contentstatus', v_content,
            'publicatietiming', case when p_payload ? 'publicatie_trigger' then true else null end
          ))
      where id = p_id;
    end if;
    if v_status is not null and v_van_publicatie is distinct from v_status then
      insert into public.auditlog (actor_id, actor_type, actor_naam, onderwerp_type, onderwerp_id, actie, van, naar, dedup_sleutel)
      values (
        p_actor_id, 'gebruiker', nullif(btrim(coalesce(p_actor_naam, '')), ''),
        'activiteit', p_tabel || ':' || p_id::text, 'publicatiestatus', v_van_publicatie, v_status,
        'publicatie:' || p_tabel || ':' || p_id::text || ':' || v_status || ':bewaar'
      );
    end if;
    if v_content is not null and v_van_content is distinct from v_content then
      insert into public.auditlog (actor_id, actor_type, actor_naam, onderwerp_type, onderwerp_id, actie, van, naar, dedup_sleutel)
      values (
        p_actor_id, 'gebruiker', nullif(btrim(coalesce(p_actor_naam, '')), ''),
        'activiteit', p_tabel || ':' || p_id::text, 'contentstatus', v_van_content, v_content,
        'content:' || p_tabel || ':' || p_id::text || ':' || v_content || ':bewaar'
      );
    end if;
  else
    return jsonb_build_object('ok', false, 'melding', 'Onbekende actie.', 'mail', false, 'workflow', false, 'jobs', 0);
  end if;

  if (select count(*) from public.communicatie_jobs) <> v_jobs then
    raise exception 'activiteitbeheer mag geen communicatiejob maken';
  end if;
  return jsonb_build_object('ok', true, 'melding', 'Opgeslagen.', 'mail', false, 'workflow', false, 'jobs', 0);
end;
$$;

revoke all on function public.beheer_activiteit_mutatie(text, bigint, text, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.beheer_activiteit_mutatie(text, bigint, text, jsonb, text, uuid) to service_role;
