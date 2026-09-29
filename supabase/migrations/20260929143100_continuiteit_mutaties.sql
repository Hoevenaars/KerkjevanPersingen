-- Atomische toepassing van continuïteitsmutaties.
-- Alleen service_role. De functie staat in public omdat PostgREST daar RPC
-- vandaan haalt; anon en authenticated mogen hem niet aanroepen.

create or replace function public.pas_continuiteit_mutaties(p_mutaties jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  refs jsonb := '{}'::jsonb;
  velden jsonb;
  new_id bigint;
  v_id bigint;
  v_boeking bigint;
  v_aanvraag bigint;
  v_relatie bigint;
  v_template bigint;
begin
  if p_mutaties is null or jsonb_typeof(p_mutaties) <> 'array' then
    raise exception 'mutaties moeten een json-array zijn';
  end if;

  for item in select value from jsonb_array_elements(p_mutaties)
  loop
    velden := coalesce(item->'velden', '{}'::jsonb);
    new_id := null;

    if item->>'soort' = 'insert_relatie' then
      insert into public.relaties (naam, email, telefoon, adres)
      values (
        velden->>'naam',
        nullif(velden->>'email', ''),
        nullif(velden->>'telefoon', ''),
        nullif(velden->>'adres', '')
      )
      returning id into new_id;
      refs := refs || jsonb_build_object(item->>'ref', new_id);

    elsif item->>'soort' = 'insert_aanvraag' then
      v_relatie := coalesce(
        nullif(velden->>'relatie_id', '')::bigint,
        nullif(refs->>(item->>'relatie_ref'), '')::bigint
      );
      insert into public.aanvragen (
        status, naam, email, telefoon, adres, verhuurtype_sleutel,
        start_datum, eind_datum, aantal_personen, toelichting, website,
        relatie_id, beoordeling_deadline, informatievraag, legacy_source, legacy_id
      ) values (
        coalesce((velden->>'status')::public.aanvraag_status, 'nieuw'),
        velden->>'naam',
        velden->>'email',
        nullif(velden->>'telefoon', ''),
        nullif(velden->>'adres', ''),
        nullif(velden->>'verhuurtype_sleutel', ''),
        nullif(velden->>'start_datum', '')::date,
        nullif(velden->>'eind_datum', '')::date,
        nullif(velden->>'aantal_personen', ''),
        nullif(velden->>'toelichting', ''),
        nullif(velden->>'website', ''),
        v_relatie,
        nullif(velden->>'beoordeling_deadline', '')::date,
        nullif(velden->>'informatievraag', ''),
        nullif(velden->>'legacy_source', ''),
        nullif(velden->>'legacy_id', '')
      )
      returning id into new_id;
      refs := refs || jsonb_build_object(item->>'ref', new_id);

    elsif item->>'soort' = 'update_aanvraag' then
      v_id := coalesce(
        nullif(item->>'id', '')::bigint,
        nullif(refs->>(item->>'ref'), '')::bigint
      );
      update public.aanvragen set
        status = case when velden ? 'status' then (velden->>'status')::public.aanvraag_status else status end,
        afwijsreden = case when velden ? 'afwijsreden' then velden->>'afwijsreden' else afwijsreden end,
        informatievraag = case when velden ? 'informatievraag' then velden->>'informatievraag' else informatievraag end,
        informatie_ontvangen_op = case
          when velden ? 'informatie_ontvangen_op' then nullif(velden->>'informatie_ontvangen_op', '')::timestamptz
          else informatie_ontvangen_op end,
        toelichting = case when velden ? 'toelichting' then velden->>'toelichting' else toelichting end,
        boeking_id = case
          when velden ? 'boeking_id' then nullif(velden->>'boeking_id', '')::bigint
          when item ? 'boeking_ref' then nullif(refs->>(item->>'boeking_ref'), '')::bigint
          else boeking_id end
      where id = v_id;

    elsif item->>'soort' = 'insert_boeking' then
      v_relatie := coalesce(
        nullif(velden->>'huurder_relatie_id', '')::bigint,
        nullif(refs->>(item->>'relatie_ref'), '')::bigint
      );
      v_aanvraag := coalesce(
        nullif(velden->>'aanvraag_id', '')::bigint,
        nullif(refs->>(item->>'aanvraag_ref'), '')::bigint
      );
      insert into public.boekingen (
        nummer, status, verhuurtype_sleutel, interne_titel, start_datum, eind_datum,
        huurder_relatie_id, gastheer_relatie_id, aanvraag_id,
        huurder_naam_snapshot, huurder_email_snapshot, huurder_telefoon_snapshot, huurder_adres_snapshot,
        aantal_personen, toelichting, website,
        tarief_prijstype, tarief_bedrag, tarief_geldig_vanaf, tarief_vastgelegd_op,
        aanbetaling_standaard, aanbetaling_bedrag, aanbetaling_ontvangen,
        optie_aangemaakt_op, optietermijn_dagen, optie_einddatum,
        legacy_source, legacy_id
      ) values (
        nullif(velden->>'nummer', ''),
        coalesce((velden->>'status')::public.boeking_status, 'optie'),
        nullif(velden->>'verhuurtype_sleutel', ''),
        velden->>'interne_titel',
        (velden->>'start_datum')::date,
        (velden->>'eind_datum')::date,
        v_relatie,
        nullif(velden->>'gastheer_relatie_id', '')::bigint,
        v_aanvraag,
        nullif(velden->>'huurder_naam_snapshot', ''),
        nullif(velden->>'huurder_email_snapshot', ''),
        nullif(velden->>'huurder_telefoon_snapshot', ''),
        nullif(velden->>'huurder_adres_snapshot', ''),
        nullif(velden->>'aantal_personen', ''),
        nullif(velden->>'toelichting', ''),
        nullif(velden->>'website', ''),
        nullif(velden->>'tarief_prijstype', '')::public.prijstype,
        nullif(velden->>'tarief_bedrag', '')::numeric,
        nullif(velden->>'tarief_geldig_vanaf', '')::date,
        nullif(velden->>'tarief_vastgelegd_op', '')::date,
        nullif(velden->>'aanbetaling_standaard', '')::numeric,
        nullif(velden->>'aanbetaling_bedrag', '')::numeric,
        coalesce((velden->>'aanbetaling_ontvangen')::boolean, false),
        nullif(velden->>'optie_aangemaakt_op', '')::date,
        nullif(velden->>'optietermijn_dagen', '')::integer,
        nullif(velden->>'optie_einddatum', '')::date,
        nullif(velden->>'legacy_source', ''),
        nullif(velden->>'legacy_id', '')
      )
      returning id into new_id;
      refs := refs || jsonb_build_object(item->>'ref', new_id);

    elsif item->>'soort' = 'update_boeking' then
      v_id := coalesce(nullif(item->>'id', '')::bigint, nullif(refs->>(item->>'ref'), '')::bigint);
      update public.boekingen set
        status = case when velden ? 'status' then (velden->>'status')::public.boeking_status else status end,
        gastheer_relatie_id = case
          when velden ? 'gastheer_relatie_id' then nullif(velden->>'gastheer_relatie_id', '')::bigint
          else gastheer_relatie_id end,
        aanbetaling_ontvangen = case
          when velden ? 'aanbetaling_ontvangen' then (velden->>'aanbetaling_ontvangen')::boolean
          else aanbetaling_ontvangen end,
        aanbetaling_ontvangen_op = case
          when velden ? 'aanbetaling_ontvangen_op' then nullif(velden->>'aanbetaling_ontvangen_op', '')::timestamptz
          else aanbetaling_ontvangen_op end,
        optie_einddatum = case
          when velden ? 'optie_einddatum' then nullif(velden->>'optie_einddatum', '')::date
          else optie_einddatum end,
        optietermijn_dagen = case
          when velden ? 'optietermijn_dagen' then nullif(velden->>'optietermijn_dagen', '')::integer
          else optietermijn_dagen end,
        bijgewerkt_op = now()
      where id = v_id;

    elsif item->>'soort' = 'upsert_publiek' then
      v_boeking := coalesce(
        nullif(velden->>'boeking_id', '')::bigint,
        nullif(refs->>(item->>'boeking_ref'), '')::bigint
      );
      insert into public.publieke_activiteiten (
        boeking_id, titel, slug, omschrijving, start_datum, eind_datum,
        publicatie_trigger, gepubliceerd, gepubliceerd_op, inhoud_status,
        praktische_informatie, beoordeling_toelichting, ingediend_op,
        goedgekeurd_op, goedgekeurd_door, inhoud_versie, foto_pad, foto_alt, legacy_source, legacy_id
      ) values (
        v_boeking,
        nullif(velden->>'titel', ''),
        nullif(velden->>'slug', ''),
        nullif(velden->>'omschrijving', ''),
        (velden->>'start_datum')::date,
        (velden->>'eind_datum')::date,
        coalesce((velden->>'publicatie_trigger')::public.publicatie_trigger, 'zodra_content_compleet'),
        coalesce((velden->>'gepubliceerd')::boolean, false),
        nullif(velden->>'gepubliceerd_op', '')::timestamptz,
        coalesce((velden->>'inhoud_status')::public.inhoud_status, 'niet_gestart'),
        nullif(velden->>'praktische_informatie', ''),
        nullif(velden->>'beoordeling_toelichting', ''),
        nullif(velden->>'ingediend_op', '')::timestamptz,
        nullif(velden->>'goedgekeurd_op', '')::timestamptz,
        nullif(velden->>'goedgekeurd_door', '')::uuid,
        coalesce(nullif(velden->>'inhoud_versie', '')::integer, 0),
        nullif(velden->>'foto_pad', ''),
        nullif(velden->>'foto_alt', ''),
        nullif(velden->>'legacy_source', ''),
        nullif(velden->>'legacy_id', '')
      )
      on conflict (boeking_id) where boeking_id is not null do update set
        titel = coalesce(excluded.titel, public.publieke_activiteiten.titel),
        slug = coalesce(excluded.slug, public.publieke_activiteiten.slug),
        omschrijving = coalesce(excluded.omschrijving, public.publieke_activiteiten.omschrijving),
        publicatie_trigger = excluded.publicatie_trigger,
        gepubliceerd = excluded.gepubliceerd,
        gepubliceerd_op = coalesce(excluded.gepubliceerd_op, public.publieke_activiteiten.gepubliceerd_op),
        inhoud_status = excluded.inhoud_status,
        praktische_informatie = coalesce(excluded.praktische_informatie, public.publieke_activiteiten.praktische_informatie),
        beoordeling_toelichting = coalesce(excluded.beoordeling_toelichting, public.publieke_activiteiten.beoordeling_toelichting),
        ingediend_op = coalesce(excluded.ingediend_op, public.publieke_activiteiten.ingediend_op),
        goedgekeurd_op = coalesce(excluded.goedgekeurd_op, public.publieke_activiteiten.goedgekeurd_op),
        goedgekeurd_door = coalesce(excluded.goedgekeurd_door, public.publieke_activiteiten.goedgekeurd_door),
        inhoud_versie = excluded.inhoud_versie,
        foto_pad = coalesce(excluded.foto_pad, public.publieke_activiteiten.foto_pad),
        foto_alt = coalesce(excluded.foto_alt, public.publieke_activiteiten.foto_alt);

    elsif item->>'soort' = 'upsert_taak' then
      v_boeking := coalesce(nullif(velden->>'boeking_id', '')::bigint, nullif(refs->>(item->>'boeking_ref'), '')::bigint);
      v_aanvraag := coalesce(nullif(velden->>'aanvraag_id', '')::bigint, nullif(refs->>(item->>'aanvraag_ref'), '')::bigint);
      insert into public.workflow_taken (
        boeking_id, aanvraag_id, taak_type, status, eigenaar_type, deadline, prioriteit, dedup_sleutel, toelichting, afgerond_op
      ) values (
        v_boeking,
        v_aanvraag,
        velden->>'taak_type',
        coalesce(velden->>'status', 'open'),
        velden->>'eigenaar_type',
        nullif(velden->>'deadline', '')::date,
        coalesce(nullif(velden->>'prioriteit', '')::integer, 50),
        velden->>'dedup_sleutel',
        nullif(velden->>'toelichting', ''),
        nullif(velden->>'afgerond_op', '')::timestamptz
      )
      on conflict (dedup_sleutel) do update set
        status = excluded.status,
        deadline = excluded.deadline,
        toelichting = coalesce(excluded.toelichting, public.workflow_taken.toelichting),
        afgerond_op = coalesce(excluded.afgerond_op, public.workflow_taken.afgerond_op),
        bijgewerkt_op = now()
      where public.workflow_taken.status is distinct from 'afgerond'
         or excluded.status = 'afgerond';

    elsif item->>'soort' = 'upsert_job' then
      v_boeking := coalesce(nullif(velden->>'boeking_id', '')::bigint, nullif(refs->>(item->>'boeking_ref'), '')::bigint);
      v_aanvraag := coalesce(nullif(velden->>'aanvraag_id', '')::bigint, nullif(refs->>(item->>'aanvraag_ref'), '')::bigint);
      v_template := coalesce(nullif(velden->>'template_id', '')::bigint, nullif(refs->>(item->>'template_ref'), '')::bigint);
      if v_template is null and nullif(velden->>'template_sleutel', '') is not null then
        select id into v_template from public.communicatie_templates where sleutel = velden->>'template_sleutel';
      end if;
      if v_template is null then
        raise exception 'mailtemplate ontbreekt: %', coalesce(velden->>'template_sleutel', '(leeg)');
      end if;
      insert into public.communicatie_jobs (
        boeking_id, aanvraag_id, template_id, relatie_id, gepland_op, status, pogingen, foutmelding,
        dedup_sleutel, template_sleutel, ontvanger_email, onderwerp, modus, laatste_poging_op
      ) values (
        v_boeking,
        v_aanvraag,
        v_template,
        nullif(velden->>'relatie_id', '')::bigint,
        nullif(velden->>'gepland_op', '')::timestamptz,
        coalesce((velden->>'status')::public.communicatie_status, 'gepland'),
        coalesce(nullif(velden->>'pogingen', '')::integer, 0),
        nullif(velden->>'foutmelding', ''),
        velden->>'dedup_sleutel',
        nullif(velden->>'template_sleutel', ''),
        nullif(velden->>'ontvanger_email', ''),
        nullif(velden->>'onderwerp', ''),
        nullif(velden->>'modus', ''),
        nullif(velden->>'laatste_poging_op', '')::timestamptz
      )
      on conflict (dedup_sleutel) where dedup_sleutel is not null do update set
        status = excluded.status,
        pogingen = excluded.pogingen,
        foutmelding = excluded.foutmelding,
        gepland_op = excluded.gepland_op,
        onderwerp = coalesce(excluded.onderwerp, public.communicatie_jobs.onderwerp),
        laatste_poging_op = coalesce(excluded.laatste_poging_op, public.communicatie_jobs.laatste_poging_op)
      where public.communicatie_jobs.status is distinct from 'verzonden'
      returning id into new_id;
      if item ? 'ref' and new_id is not null then
        refs := refs || jsonb_build_object(item->>'ref', new_id);
      end if;

    elsif item->>'soort' = 'insert_audit' then
      insert into public.auditlog (
        actor_id, actor_naam, actor_type, onderwerp_type, onderwerp_id, actie, van, naar, reden, details, dedup_sleutel
      ) values (
        nullif(velden->>'actor_id', '')::uuid,
        nullif(velden->>'actor_naam', ''),
        nullif(velden->>'actor_type', ''),
        velden->>'onderwerp_type',
        velden->>'onderwerp_id',
        velden->>'actie',
        nullif(velden->>'van', ''),
        nullif(velden->>'naar', ''),
        nullif(velden->>'reden', ''),
        velden->'details',
        nullif(velden->>'dedup_sleutel', '')
      )
      on conflict (dedup_sleutel) where dedup_sleutel is not null do nothing;

    elsif item->>'soort' = 'insert_token' then
      v_boeking := coalesce(nullif(velden->>'boeking_id', '')::bigint, nullif(refs->>(item->>'boeking_ref'), '')::bigint);
      v_aanvraag := coalesce(nullif(velden->>'aanvraag_id', '')::bigint, nullif(refs->>(item->>'aanvraag_ref'), '')::bigint);
      insert into public.toegangstokens (boeking_id, aanvraag_id, doel, token_hash, verloopt_op)
      values (
        v_boeking,
        v_aanvraag,
        velden->>'doel',
        velden->>'token_hash',
        (velden->>'verloopt_op')::timestamptz
      )
      on conflict (token_hash) do nothing;

    elsif item->>'soort' = 'update_token' then
      v_id := nullif(item->>'id', '')::bigint;
      update public.toegangstokens set
        ingetrokken_op = case when velden ? 'ingetrokken_op' then nullif(velden->>'ingetrokken_op', '')::timestamptz else ingetrokken_op end,
        gebruikt_op = case when velden ? 'gebruikt_op' then nullif(velden->>'gebruikt_op', '')::timestamptz else gebruikt_op end
      where id = v_id;

    elsif item->>'soort' = 'upsert_betaling' then
      v_boeking := coalesce(nullif(velden->>'boeking_id', '')::bigint, nullif(refs->>(item->>'boeking_ref'), '')::bigint);
      insert into public.betalingen (boeking_id, soort, bedrag, status, vervaldatum, ontvangen_op, referentie)
      values (
        v_boeking,
        velden->>'soort',
        (velden->>'bedrag')::numeric,
        velden->>'status',
        nullif(velden->>'vervaldatum', '')::date,
        nullif(velden->>'ontvangen_op', '')::timestamptz,
        nullif(velden->>'referentie', '')
      )
      on conflict (boeking_id) where soort = 'aanbetaling' do nothing;

    elsif item->>'soort' = 'insert_incident' then
      v_boeking := coalesce(nullif(velden->>'boeking_id', '')::bigint, nullif(refs->>(item->>'boeking_ref'), '')::bigint);
      insert into public.incidenten (boeking_id, omschrijving, status, gemeld_door)
      values (
        v_boeking,
        velden->>'omschrijving',
        coalesce(velden->>'status', 'open'),
        nullif(velden->>'gemeld_door', '')::uuid
      );

    elsif item->>'soort' = 'update_incident' then
      update public.incidenten set
        status = coalesce(velden->>'status', status),
        gesloten_op = case when velden ? 'gesloten_op' then nullif(velden->>'gesloten_op', '')::timestamptz else gesloten_op end
      where id = nullif(item->>'id', '')::bigint;

    elsif item->>'soort' = 'insert_poging' then
      insert into public.communicatie_pogingen (job_id, poging, status, foutmelding)
      values (
        coalesce(nullif(velden->>'job_id', '')::bigint, nullif(refs->>(item->>'job_ref'), '')::bigint),
        (velden->>'poging')::integer,
        (velden->>'status')::public.communicatie_status,
        nullif(velden->>'foutmelding', '')
      )
      on conflict (job_id, poging) do nothing;

    elsif item->>'soort' = 'insert_verzending' then
      insert into public.communicatie_verzendingen (
        boeking_id, template_id, relatie_id, email_op_verzendmoment, gepland_op, verzonden_op,
        status, foutmelding, handmatig, test
      ) values (
        nullif(velden->>'boeking_id', '')::bigint,
        nullif(velden->>'template_id', '')::bigint,
        nullif(velden->>'relatie_id', '')::bigint,
        nullif(velden->>'email_op_verzendmoment', ''),
        nullif(velden->>'gepland_op', '')::timestamptz,
        nullif(velden->>'verzonden_op', '')::timestamptz,
        (velden->>'status')::public.communicatie_status,
        nullif(velden->>'foutmelding', ''),
        coalesce((velden->>'handmatig')::boolean, false),
        coalesce((velden->>'test')::boolean, false)
      );

    elsif item->>'soort' = 'insert_intern' then
      insert into public.interne_activiteiten (
        titel, start_datum, eind_datum, blokkeert_verhuurkalender, notities, legacy_source, legacy_id
      ) values (
        velden->>'titel',
        (velden->>'start_datum')::date,
        (velden->>'eind_datum')::date,
        coalesce((velden->>'blokkeert_verhuurkalender')::boolean, false),
        nullif(velden->>'notities', ''),
        nullif(velden->>'legacy_source', ''),
        nullif(velden->>'legacy_id', '')
      )
      on conflict do nothing;

    else
      raise exception 'onbekende mutatie: %', item->>'soort';
    end if;
  end loop;

  return refs;
end;
$$;

revoke all on function public.pas_continuiteit_mutaties(jsonb) from public, anon, authenticated;
grant execute on function public.pas_continuiteit_mutaties(jsonb) to service_role;

-- Interne activiteiten hebben geen unieke legacy-sleutel in het basisschema.
create unique index if not exists interne_activiteiten_legacy_uniek
  on public.interne_activiteiten (legacy_id)
  where legacy_id is not null;
