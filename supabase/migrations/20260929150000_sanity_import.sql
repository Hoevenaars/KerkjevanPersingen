-- Idempotente Sanity-import voor staging.
-- Eén batch, upsert op legacy_id. Een tweede run maakt geen duplicaten.
-- Conflicten (bezetting, unieke slug of e-mail) blijven in het rapport staan.

create unique index if not exists nieuwsbrieven_legacy_id_unique
  on public.nieuwsbrieven (legacy_id)
  where legacy_id is not null;

create or replace function public.importeer_sanity_batch(p_batch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rij jsonb;
  rol text;
  v_id bigint;
  v_boeking bigint;
  v_relatie bigint;
  v_aanvraag bigint;
  v_gastheer bigint;
  nieuw integer := 0;
  bijgewerkt integer := 0;
  ingevoegd boolean;
  conflicten jsonb := '[]'::jsonb;
begin
  if p_batch is null or jsonb_typeof(p_batch) <> 'object' then
    raise exception 'batch moet een json-object zijn';
  end if;

  for rij in select value from jsonb_array_elements(coalesce(p_batch->'relaties', '[]'::jsonb))
  loop
    begin
      insert into public.relaties (naam, email, telefoon, adres, legacy_source, legacy_id)
      values (
        coalesce(nullif(rij->>'naam', ''), 'Naamloos'),
        nullif(rij->>'email', ''),
        nullif(rij->>'telefoon', ''),
        nullif(rij->>'adres', ''),
        'sanity',
        rij->>'legacy_id'
      )
      on conflict (legacy_id) where legacy_id is not null do update set
        naam = excluded.naam,
        email = excluded.email,
        telefoon = excluded.telefoon,
        adres = excluded.adres
      returning id, (xmax = 0) into v_id, ingevoegd;
      if ingevoegd then nieuw := nieuw + 1; else bijgewerkt := bijgewerkt + 1; end if;
      if rij ? 'rollen' and jsonb_typeof(rij->'rollen') = 'array' then
        for rol in select value from jsonb_array_elements_text(rij->'rollen')
        loop
          insert into public.relatie_rollen (relatie_id, rol) values (v_id, rol)
          on conflict do nothing;
        end loop;
      end if;
    exception when others then
      conflicten := conflicten || jsonb_build_array(jsonb_build_object('soort', 'relatie', 'legacy_id', rij->>'legacy_id', 'fout', sqlerrm));
    end;
  end loop;

  for rij in select value from jsonb_array_elements(coalesce(p_batch->'aanvragen', '[]'::jsonb))
  loop
    begin
      select id into v_relatie from public.relaties where legacy_id = nullif(rij->>'relatie_legacy_id', '');
      insert into public.aanvragen (
        status, naam, email, telefoon, adres, verhuurtype_sleutel,
        start_datum, eind_datum, aantal_personen, toelichting, website, afwijsreden,
        relatie_id, legacy_source, legacy_id
      ) values (
        coalesce((nullif(rij->>'status', ''))::public.aanvraag_status, 'nieuw'),
        rij->>'naam',
        rij->>'email',
        nullif(rij->>'telefoon', ''),
        nullif(rij->>'adres', ''),
        nullif(rij->>'verhuurtype_sleutel', ''),
        nullif(rij->>'start_datum', '')::date,
        nullif(rij->>'eind_datum', '')::date,
        nullif(rij->>'aantal_personen', ''),
        nullif(rij->>'toelichting', ''),
        nullif(rij->>'website', ''),
        nullif(rij->>'afwijsreden', ''),
        v_relatie,
        'sanity',
        rij->>'legacy_id'
      )
      on conflict (legacy_id) where legacy_id is not null do update set
        status = excluded.status,
        naam = excluded.naam,
        email = excluded.email,
        telefoon = excluded.telefoon,
        adres = excluded.adres,
        verhuurtype_sleutel = excluded.verhuurtype_sleutel,
        start_datum = excluded.start_datum,
        eind_datum = excluded.eind_datum,
        toelichting = excluded.toelichting,
        relatie_id = excluded.relatie_id
      returning (xmax = 0) into ingevoegd;
      if ingevoegd then nieuw := nieuw + 1; else bijgewerkt := bijgewerkt + 1; end if;
    exception when others then
      conflicten := conflicten || jsonb_build_array(jsonb_build_object('soort', 'aanvraag', 'legacy_id', rij->>'legacy_id', 'fout', sqlerrm));
    end;
  end loop;

  for rij in select value from jsonb_array_elements(coalesce(p_batch->'boekingen', '[]'::jsonb))
  loop
    begin
      select id into v_relatie from public.relaties where legacy_id = nullif(rij->>'relatie_legacy_id', '');
      select id into v_aanvraag from public.aanvragen where legacy_id = nullif(rij->>'aanvraag_legacy_id', '');
      select id into v_gastheer from public.relaties where legacy_id = nullif(rij->>'gastheer_legacy_id', '');
      insert into public.boekingen (
        nummer, status, verhuurtype_sleutel, interne_titel, start_datum, eind_datum,
        huurder_relatie_id, gastheer_relatie_id, aanvraag_id,
        huurder_naam_snapshot, huurder_email_snapshot, huurder_telefoon_snapshot, huurder_adres_snapshot,
        aantal_personen, toelichting, website, tarief_bedrag, aanbetaling_ontvangen,
        legacy_source, legacy_id
      ) values (
        nullif(rij->>'nummer', ''),
        coalesce((nullif(rij->>'status', ''))::public.boeking_status, 'migratie_vastgelegd'),
        nullif(rij->>'verhuurtype_sleutel', ''),
        coalesce(nullif(rij->>'interne_titel', ''), 'Activiteit'),
        (rij->>'start_datum')::date,
        coalesce(nullif(rij->>'eind_datum', '')::date, (rij->>'start_datum')::date),
        v_relatie,
        v_gastheer,
        v_aanvraag,
        nullif(rij->>'huurder_naam_snapshot', ''),
        nullif(rij->>'huurder_email_snapshot', ''),
        nullif(rij->>'huurder_telefoon_snapshot', ''),
        nullif(rij->>'huurder_adres_snapshot', ''),
        nullif(rij->>'aantal_personen', ''),
        nullif(rij->>'toelichting', ''),
        nullif(rij->>'website', ''),
        nullif(rij->>'tarief_bedrag', '')::numeric,
        coalesce((rij->>'aanbetaling_ontvangen')::boolean, false),
        'sanity',
        rij->>'legacy_id'
      )
      on conflict (legacy_id) where legacy_id is not null do update set
        status = excluded.status,
        verhuurtype_sleutel = excluded.verhuurtype_sleutel,
        interne_titel = excluded.interne_titel,
        start_datum = excluded.start_datum,
        eind_datum = excluded.eind_datum,
        huurder_relatie_id = excluded.huurder_relatie_id,
        gastheer_relatie_id = excluded.gastheer_relatie_id,
        aanvraag_id = excluded.aanvraag_id,
        aanbetaling_ontvangen = excluded.aanbetaling_ontvangen,
        bijgewerkt_op = now()
      returning id, (xmax = 0) into v_boeking, ingevoegd;
      if ingevoegd then nieuw := nieuw + 1; else bijgewerkt := bijgewerkt + 1; end if;
    exception when others then
      conflicten := conflicten || jsonb_build_array(jsonb_build_object('soort', 'boeking', 'legacy_id', rij->>'legacy_id', 'fout', sqlerrm));
    end;
  end loop;

  update public.aanvragen a
  set boeking_id = b.id
  from public.boekingen b
  where a.boeking_id is null
    and b.aanvraag_id = a.id;

  for rij in select value from jsonb_array_elements(coalesce(p_batch->'aanvragen', '[]'::jsonb))
  loop
    if nullif(rij->>'boeking_legacy_id', '') is null then
      continue;
    end if;
    update public.aanvragen a
    set boeking_id = b.id
    from public.boekingen b
    where a.legacy_id = rij->>'legacy_id'
      and b.legacy_id = rij->>'boeking_legacy_id';
  end loop;

  for rij in select value from jsonb_array_elements(coalesce(p_batch->'publiek', '[]'::jsonb))
  loop
    begin
      select id into v_boeking from public.boekingen where legacy_id = rij->>'boeking_legacy_id';
      if v_boeking is null then
        conflicten := conflicten || jsonb_build_array(jsonb_build_object('soort', 'publiek', 'legacy_id', rij->>'boeking_legacy_id', 'fout', 'boeking ontbreekt'));
        continue;
      end if;
      insert into public.publieke_activiteiten (
        boeking_id, titel, slug, omschrijving, start_datum, eind_datum,
        publicatie_trigger, gepubliceerd, inhoud_status, foto_pad, foto_alt,
        legacy_source, legacy_id
      ) values (
        v_boeking,
        nullif(rij->>'titel', ''),
        nullif(rij->>'slug', ''),
        nullif(rij->>'omschrijving', ''),
        (rij->>'start_datum')::date,
        (rij->>'eind_datum')::date,
        coalesce((nullif(rij->>'publicatie_trigger', ''))::public.publicatie_trigger, 'zodra_content_compleet'),
        coalesce((rij->>'gepubliceerd')::boolean, false),
        coalesce((nullif(rij->>'inhoud_status', ''))::public.inhoud_status, 'niet_gestart'),
        nullif(rij->>'foto_pad', ''),
        nullif(rij->>'foto_alt', ''),
        'sanity',
        rij->>'boeking_legacy_id'
      )
      on conflict (boeking_id) where boeking_id is not null do update set
        titel = excluded.titel,
        slug = excluded.slug,
        omschrijving = excluded.omschrijving,
        publicatie_trigger = excluded.publicatie_trigger,
        gepubliceerd = excluded.gepubliceerd,
        inhoud_status = excluded.inhoud_status,
        foto_pad = coalesce(excluded.foto_pad, public.publieke_activiteiten.foto_pad),
        foto_alt = coalesce(excluded.foto_alt, public.publieke_activiteiten.foto_alt)
      returning (xmax = 0) into ingevoegd;
      if ingevoegd then nieuw := nieuw + 1; else bijgewerkt := bijgewerkt + 1; end if;
    exception when others then
      conflicten := conflicten || jsonb_build_array(jsonb_build_object('soort', 'publiek', 'legacy_id', rij->>'boeking_legacy_id', 'fout', sqlerrm));
    end;
  end loop;

  for rij in select value from jsonb_array_elements(coalesce(p_batch->'intern', '[]'::jsonb))
  loop
    begin
      insert into public.interne_activiteiten (
        titel, start_datum, eind_datum, blokkeert_verhuurkalender, legacy_source, legacy_id
      ) values (
        coalesce(nullif(rij->>'titel', ''), 'Intern'),
        (rij->>'start_datum')::date,
        (rij->>'eind_datum')::date,
        coalesce((rij->>'blokkeert')::boolean, true),
        'sanity',
        rij->>'legacy_id'
      )
      on conflict (legacy_id) where legacy_id is not null do update set
        titel = excluded.titel,
        start_datum = excluded.start_datum,
        eind_datum = excluded.eind_datum,
        blokkeert_verhuurkalender = excluded.blokkeert_verhuurkalender
      returning (xmax = 0) into ingevoegd;
      if ingevoegd then nieuw := nieuw + 1; else bijgewerkt := bijgewerkt + 1; end if;
    exception when others then
      conflicten := conflicten || jsonb_build_array(jsonb_build_object('soort', 'intern', 'legacy_id', rij->>'legacy_id', 'fout', sqlerrm));
    end;
  end loop;

  for rij in select value from jsonb_array_elements(coalesce(p_batch->'vrienden', '[]'::jsonb))
  loop
    begin
      insert into public.vrienden (naam, email, actief, frequentie, uitschrijf_token, legacy_source, legacy_id)
      values (
        nullif(rij->>'naam', ''),
        rij->>'email',
        coalesce((rij->>'actief')::boolean, true),
        coalesce((nullif(rij->>'frequentie', ''))::public.vriend_frequentie, 'wekelijks'),
        rij->>'uitschrijf_token',
        'sanity',
        rij->>'legacy_id'
      )
      on conflict (legacy_id) where legacy_id is not null do update set
        naam = excluded.naam,
        email = excluded.email,
        actief = excluded.actief,
        frequentie = excluded.frequentie
      returning (xmax = 0) into ingevoegd;
      if ingevoegd then nieuw := nieuw + 1; else bijgewerkt := bijgewerkt + 1; end if;
    exception when others then
      conflicten := conflicten || jsonb_build_array(jsonb_build_object('soort', 'vriend', 'legacy_id', rij->>'legacy_id', 'fout', sqlerrm));
    end;
  end loop;

  for rij in select value from jsonb_array_elements(coalesce(p_batch->'nieuwsbrieven', '[]'::jsonb))
  loop
    begin
      insert into public.nieuwsbrieven (
        week_maandag, kort_nieuws, foto_alt, donatie_update, overgeslagen, verstuurd, legacy_source, legacy_id
      ) values (
        (rij->>'week_maandag')::date,
        nullif(rij->>'kort_nieuws', ''),
        nullif(rij->>'foto_alt', ''),
        nullif(rij->>'donatie_update', ''),
        coalesce((rij->>'overgeslagen')::boolean, false),
        coalesce((rij->>'verstuurd')::boolean, false),
        'sanity',
        rij->>'legacy_id'
      )
      on conflict (legacy_id) where legacy_id is not null do update set
        week_maandag = excluded.week_maandag,
        kort_nieuws = excluded.kort_nieuws,
        overgeslagen = excluded.overgeslagen,
        verstuurd = excluded.verstuurd
      returning (xmax = 0) into ingevoegd;
      if ingevoegd then nieuw := nieuw + 1; else bijgewerkt := bijgewerkt + 1; end if;
    exception when others then
      conflicten := conflicten || jsonb_build_array(jsonb_build_object('soort', 'nieuwsbrief', 'legacy_id', rij->>'legacy_id', 'fout', sqlerrm));
    end;
  end loop;

  return jsonb_build_object(
    'nieuw', nieuw,
    'bijgewerkt', bijgewerkt,
    'conflicten', conflicten,
    'boekingen', (select count(*) from public.boekingen where legacy_source = 'sanity'),
    'aanvragen', (select count(*) from public.aanvragen where legacy_source = 'sanity'),
    'publiek_online', (
      select count(*) from public.publieke_activiteiten
      where legacy_source = 'sanity' and gepubliceerd and inhoud_status = 'goedgekeurd'
    )
  );
end;
$$;

revoke all on function public.importeer_sanity_batch(jsonb) from public, anon, authenticated;
grant execute on function public.importeer_sanity_batch(jsonb) to service_role;
