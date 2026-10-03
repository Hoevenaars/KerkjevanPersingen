-- Opslaan schrijft alleen content. Een nieuw concept is verborgen, nooit bezet.
-- Publiceren en Toch publiceren zetten de trigger op direct: meteen online.
-- Een ontbrekende slug wordt bij publiceren aangemaakt.
-- Geen mail, geen workflow, geen communicatiejob, geen boekingmutatie.

create or replace function public.slug_van_tekst(p_bron text)
returns text
language sql
immutable
set search_path = public
as $$
  select trim(both '-' from regexp_replace(
    regexp_replace(
      replace(
        translate(
          lower(coalesce(p_bron, '')),
          'àáâäãåèéêëìíîïòóôöõùúûüýÿçñ',
          'aaaaaaeeeeiiiiooooouuuuyycn'
        ),
        '&',
        ' en '
      ),
      '[^a-z0-9]+',
      '-',
      'g'
    ),
    '-+',
    '-',
    'g'
  ));
$$;

create or replace function public.publicatie_slug_vrij(p_slug text, p_huidige text, p_eigen_id bigint)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(p_slug, '') <> '' and (
    p_slug = coalesce(p_huidige, '')
    or not exists (
      select 1 from public.publieke_activiteiten
      where slug = p_slug and id is distinct from coalesce(p_eigen_id, 0)
    )
  );
$$;

create or replace function public.unieke_publicatie_slug(
  p_bron text,
  p_jaar text,
  p_huidige text,
  p_eigen_id bigint
)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_basis text := public.slug_van_tekst(p_bron);
  v_jaar text := coalesce(nullif(p_jaar, ''), 'jaar');
  v_nummer integer := 2;
begin
  if v_basis = '' then
    v_basis := 'activiteit';
  end if;
  if public.publicatie_slug_vrij(v_basis, p_huidige, p_eigen_id) then
    return v_basis;
  end if;
  if public.publicatie_slug_vrij(v_basis || '-' || v_jaar, p_huidige, p_eigen_id) then
    return v_basis || '-' || v_jaar;
  end if;
  while v_nummer < 50 and not public.publicatie_slug_vrij(v_basis || '-' || v_jaar || '-' || v_nummer::text, p_huidige, p_eigen_id) loop
    v_nummer := v_nummer + 1;
  end loop;
  return v_basis || '-' || v_jaar || '-' || v_nummer::text;
end;
$$;

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
security invoker
set search_path = public
as $$
declare
  v_jobs integer;
  v_legacy text;
  v_status text;
  v_zicht text;
  v_slug text;
  v_huidige_slug text;
  v_gewenst text;
  v_titel text;
  v_start date;
  v_eind date;
  v_force boolean;
  v_id bigint;
  v_boeking bigint;
  v_bron text := 'sanity';
  v_zicht_na text;
begin
  if p_tabel not in ('publieke_activiteiten', 'activiteit_bron', 'boekingen') then
    return jsonb_build_object('ok', false, 'melding', 'Onbekende activiteit.', 'mail', false, 'workflow', false, 'jobs', 0);
  end if;
  if p_actie not in ('bewaar', 'publiceer', 'verberg') then
    return jsonb_build_object('ok', false, 'melding', 'Onbekende actie.', 'mail', false, 'workflow', false, 'jobs', 0);
  end if;
  v_jobs := (select count(*) from public.communicatie_jobs);

  if p_tabel = 'publieke_activiteiten' then
    select legacy_id, levenscyclus, coalesce(zichtbaarheid, ''), coalesce(slug, ''), titel, start_datum, eind_datum, boeking_id
      into v_legacy, v_status, v_zicht, v_huidige_slug, v_titel, v_start, v_eind, v_boeking
    from public.publieke_activiteiten where id = p_id;
    v_id := p_id;
  elsif p_tabel = 'boekingen' then
    select status::text, coalesce(interne_titel, huurder_naam_snapshot, ''), start_datum, eind_datum
      into v_status, v_titel, v_start, v_eind
    from public.boekingen where id = p_id;
    if not found then
      return jsonb_build_object('ok', false, 'melding', 'Activiteit niet gevonden.', 'mail', false, 'workflow', false, 'jobs', 0);
    end if;
    v_boeking := p_id;
    v_bron := 'beheer';
    select id, coalesce(slug, ''), coalesce(zichtbaarheid, '')
      into v_id, v_huidige_slug, v_zicht
    from public.publieke_activiteiten
    where boeking_id = p_id
    order by id
    limit 1;
  else
    select legacy_id, levenscyclus, coalesce(zichtbaarheid, ''), coalesce(slug, ''), coalesce(titel, interne_titel, ''), start_datum, eind_datum
      into v_legacy, v_status, v_zicht, v_huidige_slug, v_titel, v_start, v_eind
    from public.activiteit_bron where id = p_id;
    select id into v_id from public.publieke_activiteiten
    where legacy_id = v_legacy
    order by id
    limit 1;
    if v_id is not null then
      select coalesce(slug, ''), coalesce(zichtbaarheid, '')
        into v_huidige_slug, v_zicht
      from public.publieke_activiteiten where id = v_id;
    end if;
  end if;
  if v_status is null then
    return jsonb_build_object('ok', false, 'melding', 'Activiteit niet gevonden.', 'mail', false, 'workflow', false, 'jobs', 0);
  end if;
  if v_status = 'geannuleerd' and p_actie = 'publiceer' then
    return jsonb_build_object('ok', false, 'melding', 'Een geannuleerde activiteit wordt niet gepubliceerd.', 'mail', false, 'workflow', false, 'jobs', 0);
  end if;

  v_gewenst := nullif(btrim(coalesce(p_payload->>'slug', '')), '');
  if v_zicht = 'publiek' and coalesce(v_huidige_slug, '') <> '' and v_gewenst is distinct from v_huidige_slug and coalesce(p_payload->>'slug_bewust', '') <> 'true' then
    v_gewenst := v_huidige_slug;
  end if;
  if p_actie = 'publiceer' and v_gewenst is null then
    v_gewenst := public.unieke_publicatie_slug(
      coalesce(
        nullif(btrim(coalesce(p_payload->>'exposanten', '')), ''),
        nullif(btrim(coalesce(p_payload->>'titel', '')), ''),
        nullif(btrim(coalesce(v_titel, '')), ''),
        'activiteit'
      ),
      coalesce(to_char(v_start, 'YYYY'), ''),
      coalesce(v_huidige_slug, ''),
      coalesce(v_id, 0)
    );
  end if;
  if v_gewenst is not null and exists (
    select 1 from public.publieke_activiteiten
    where slug = v_gewenst and id is distinct from coalesce(v_id, 0)
  ) then
    return jsonb_build_object('ok', false, 'melding', 'Deze website-URL is al in gebruik.', 'mail', false, 'workflow', false, 'jobs', 0);
  end if;

  v_force := coalesce(p_payload->>'force_publish', '') = 'true';
  v_zicht_na := case when p_actie = 'publiceer' then 'publiek' else 'verborgen' end;
  if v_id is null then
    insert into public.publieke_activiteiten (
      titel, slug, start_datum, eind_datum, exposanten, korte_omschrijving, volledige_omschrijving,
      praktische_informatie, foto_pad, zichtbaarheid, gepubliceerd, publicatie_trigger,
      legacy_source, legacy_id, boeking_id, lokale_override
    ) values (
      coalesce(nullif(btrim(coalesce(p_payload->>'titel', '')), ''), v_titel),
      v_gewenst,
      v_start,
      v_eind,
      nullif(p_payload->>'exposanten', ''),
      nullif(p_payload->>'korte_omschrijving', ''),
      nullif(p_payload->>'volledige_omschrijving', ''),
      nullif(p_payload->>'praktische_informatie', ''),
      nullif(p_payload->>'foto_pad', ''),
      v_zicht_na,
      p_actie = 'publiceer',
      case when p_actie = 'publiceer' then 'direct'::public.publicatie_trigger else 'zodra_content_compleet'::public.publicatie_trigger end,
      v_bron,
      v_legacy,
      v_boeking,
      jsonb_strip_nulls(jsonb_build_object(
        'contentvelden', true,
        'publicatiestatus', v_zicht_na,
        'publicatietiming', case when p_actie = 'publiceer' then true else null end
      ))
    )
    returning id, slug into v_id, v_slug;
  else
    update public.publieke_activiteiten
    set titel = coalesce(nullif(btrim(coalesce(p_payload->>'titel', '')), ''), titel),
        exposanten = p_payload->>'exposanten',
        korte_omschrijving = p_payload->>'korte_omschrijving',
        volledige_omschrijving = p_payload->>'volledige_omschrijving',
        praktische_informatie = p_payload->>'praktische_informatie',
        foto_pad = nullif(p_payload->>'foto_pad', ''),
        slug = coalesce(v_gewenst, slug),
        zichtbaarheid = case
          when p_actie = 'publiceer' then 'publiek'
          when p_actie = 'verberg' then 'verborgen'
          else zichtbaarheid
        end,
        gepubliceerd = case
          when p_actie = 'publiceer' then true
          when p_actie = 'verberg' then false
          else gepubliceerd
        end,
        gepubliceerd_op = case when p_actie = 'publiceer' then coalesce(gepubliceerd_op, now()) else gepubliceerd_op end,
        publicatie_trigger = case
          when p_actie = 'publiceer' then 'direct'::public.publicatie_trigger
          else publicatie_trigger
        end,
        boeking_id = coalesce(boeking_id, v_boeking),
        lokale_override = coalesce(lokale_override, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
          'contentvelden', true,
          'publicatiestatus', case
            when p_actie = 'publiceer' then 'publiek'
            when p_actie = 'verberg' then 'verborgen'
            else null
          end,
          'publicatietiming', case when p_actie = 'publiceer' then true else null end
        ))
    where id = v_id
    returning slug into v_slug;
  end if;

  if p_tabel = 'activiteit_bron' then
    update public.activiteit_bron
    set titel = coalesce(nullif(btrim(coalesce(p_payload->>'titel', '')), ''), titel),
        slug = coalesce(v_gewenst, slug),
        zichtbaarheid = case
          when p_actie = 'publiceer' then 'publiek'
          when p_actie = 'verberg' then 'verborgen'
          else zichtbaarheid
        end,
        publicatie_trigger = case
          when p_actie = 'publiceer' then 'direct'::public.publicatie_trigger
          else publicatie_trigger
        end,
        lokale_override = coalesce(lokale_override, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
          'publicatiestatus', case
            when p_actie = 'publiceer' then 'publiek'
            when p_actie = 'verberg' then 'verborgen'
            else null
          end,
          'publicatietiming', case when p_actie = 'publiceer' then true else null end
        ))
    where id = p_id;
  end if;

  if v_legacy is not null and p_actie in ('publiceer', 'verberg') then
    update public.activiteit_bron
    set zichtbaarheid = case when p_actie = 'publiceer' then 'publiek' else 'verborgen' end,
        publicatie_trigger = case
          when p_actie = 'publiceer' then 'direct'::public.publicatie_trigger
          else publicatie_trigger
        end,
        lokale_override = coalesce(lokale_override, '{}'::jsonb) || jsonb_build_object(
          'publicatiestatus', case when p_actie = 'publiceer' then 'publiek' else 'verborgen' end,
          'publicatietiming', p_actie = 'publiceer'
        )
    where legacy_id = v_legacy and id is distinct from case when p_tabel = 'activiteit_bron' then p_id else 0 end;
  end if;

  insert into public.auditlog (actor_id, actor_type, actor_naam, onderwerp_type, onderwerp_id, actie, van, naar, reden, details)
  values (
    p_actor_id,
    'gebruiker',
    nullif(btrim(coalesce(p_actor_naam, '')), ''),
    'activiteit',
    coalesce(v_id::text, p_tabel || ':' || p_id::text),
    case when p_actie = 'publiceer' and v_force then 'force_publish' else p_actie end,
    v_status,
    case when p_actie = 'publiceer' then 'publiek' when p_actie = 'verberg' then 'verborgen' else 'bewaard' end,
    case when v_force then 'force_publish' else null end,
    jsonb_build_object(
      'force_publish', v_force,
      'ontbrekend', coalesce(p_payload->'ontbrekend', '[]'::jsonb),
      'slug', v_slug,
      'publicatie_trigger', case when p_actie = 'publiceer' then 'direct' else null end
    )
  );

  if (select count(*) from public.communicatie_jobs) <> v_jobs then
    raise exception 'publiceren mag geen communicatiejob maken';
  end if;
  return jsonb_build_object('ok', true, 'melding', 'Opgeslagen.', 'mail', false, 'workflow', false, 'jobs', 0, 'force_publish', v_force);
end;
$$;

revoke all on function public.slug_van_tekst(text) from public, anon, authenticated;
revoke all on function public.publicatie_slug_vrij(text, text, bigint) from public, anon, authenticated;
revoke all on function public.unieke_publicatie_slug(text, text, text, bigint) from public, anon, authenticated;
revoke all on function public.beheer_publicatie(text, bigint, text, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.slug_van_tekst(text) to service_role;
grant execute on function public.publicatie_slug_vrij(text, text, bigint) to service_role;
grant execute on function public.unieke_publicatie_slug(text, text, text, bigint) to service_role;
grant execute on function public.beheer_publicatie(text, bigint, text, jsonb, text, uuid) to service_role;

-- Dossierformulier "direct" blijft "zodra de overige voorwaarden kloppen" en wordt
-- nog als zodra_content_compleet opgeslagen. Een al handmatig gezette trigger direct
-- blijft direct, zodat een latere inhoudsbewaring die publicatie niet terugdraait.

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
            when p_payload->>'publicatie_trigger' = 'direct'
              and publicatie_trigger = 'direct'::public.publicatie_trigger
              then publicatie_trigger
            when p_payload->>'publicatie_trigger' = 'direct' then 'zodra_content_compleet'::public.publicatie_trigger
            when v_trigger is null or v_trigger not in (
              'direct', 'zodra_content_compleet', 'uiterlijk_1_maand', 'uiterlijk_2_maanden', 'uiterlijk_3_maanden',
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
            when p_payload->>'publicatie_trigger' = 'direct'
              and publicatie_trigger = 'direct'::public.publicatie_trigger
              then publicatie_trigger
            when p_payload->>'publicatie_trigger' = 'direct' then 'zodra_content_compleet'::public.publicatie_trigger
            when v_trigger is null or v_trigger not in (
              'direct', 'zodra_content_compleet', 'uiterlijk_1_maand', 'uiterlijk_2_maanden', 'uiterlijk_3_maanden',
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
