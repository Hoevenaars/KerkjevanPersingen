-- Publiceren toont ook verhuurboekingen. Opslaan maakt één publieke activiteit
-- aan die aan dezelfde boeking hangt. Geen tweede verhuur, geen mail.

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
  if v_gewenst is not null and exists (
    select 1 from public.publieke_activiteiten
    where slug = v_gewenst and id is distinct from coalesce(v_id, 0)
  ) then
    return jsonb_build_object('ok', false, 'melding', 'Deze website-URL is al in gebruik.', 'mail', false, 'workflow', false, 'jobs', 0);
  end if;

  v_force := coalesce(p_payload->>'force_publish', '') = 'true';
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
      case when p_actie = 'publiceer' then 'publiek' when p_actie = 'verberg' then 'verborgen' else 'bezet' end,
      p_actie = 'publiceer',
      'zodra_content_compleet',
      v_bron,
      v_legacy,
      v_boeking,
      jsonb_build_object('contentvelden', true, 'publicatiestatus', case when p_actie = 'publiceer' then 'publiek' when p_actie = 'verberg' then 'verborgen' else 'bezet' end)
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
        publicatie_trigger = case when p_actie = 'publiceer' then 'zodra_content_compleet' else publicatie_trigger end,
        boeking_id = coalesce(boeking_id, v_boeking),
        lokale_override = coalesce(lokale_override, '{}'::jsonb) || jsonb_build_object(
          'contentvelden', true,
          'publicatiestatus', case
            when p_actie = 'publiceer' then 'publiek'
            when p_actie = 'verberg' then 'verborgen'
            else coalesce(zichtbaarheid, 'bezet')
          end
        )
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
        lokale_override = coalesce(lokale_override, '{}'::jsonb) || jsonb_build_object(
          'publicatiestatus', case when p_actie = 'publiceer' then 'publiek' when p_actie = 'verberg' then 'verborgen' else zichtbaarheid end
        )
    where id = p_id;
  end if;

  if v_legacy is not null and p_actie in ('publiceer', 'verberg') then
    update public.activiteit_bron
    set zichtbaarheid = case when p_actie = 'publiceer' then 'publiek' else 'verborgen' end,
        lokale_override = coalesce(lokale_override, '{}'::jsonb) || jsonb_build_object(
          'publicatiestatus', case when p_actie = 'publiceer' then 'publiek' else 'verborgen' end
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
      'slug', v_slug
    )
  );

  if (select count(*) from public.communicatie_jobs) <> v_jobs then
    raise exception 'publiceren mag geen communicatiejob maken';
  end if;
  return jsonb_build_object('ok', true, 'melding', 'Opgeslagen.', 'mail', false, 'workflow', false, 'jobs', 0, 'force_publish', v_force);
end;
$$;

revoke all on function public.beheer_publicatie(text, bigint, text, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.beheer_publicatie(text, bigint, text, jsonb, text, uuid) to service_role;
