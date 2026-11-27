-- Ook bestaande inhouds-/praktische vervolgberichten eerst duurzaam bewaren.
-- Hun bestaande timing en templates blijven gelijk. Betaalmails hebben een eigen pad.
alter table public.verhuur_proces_jobs drop constraint verhuur_proces_jobs_taak_check;
alter table public.verhuur_proces_jobs add constraint verhuur_proces_jobs_taak_check
check (taak in ('bestuursmail','contract','controleer_definitief','afwijzingsmail','definitiefmail',
 'ondertekenbevestiging','agenda','financieel','hervatten','opvolgmail'));

create or replace function public.verhuur_plan_opvolging(p_boeking_id bigint,p_mutaties jsonb,p_berichten jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare b public.boekingen%rowtype; m jsonb; j jsonb; v_aantal integer:=0;
begin
  if coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role' is distinct from 'service_role'
    then raise exception 'Geen procesbevoegdheid.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(872502,(p_boeking_id % 2147483647)::integer);
  select * into b from public.boekingen where id=p_boeking_id for share;
  if not found or b.status::text<>'definitief' or public.verhuur_machine_mag(b.id,null) is not true
    then raise exception 'De boeking heeft geen geldig uitvoeringsmandaat.'; end if;
  if jsonb_typeof(p_mutaties) is distinct from 'array' or jsonb_typeof(p_berichten) is distinct from 'array'
    then raise exception 'Ongeldige vervolgplanning.'; end if;
  -- Een tweede planner past ook de klanttokens niet opnieuw toe. Bij een
  -- gedeeltelijk veranderd plan wordt op de volgende run opnieuw gepland.
  for j in select value from jsonb_array_elements(p_berichten) loop
    if exists(select 1 from public.verhuur_proces_jobs where sleutel=j->>'sleutel') then
      return jsonb_build_object('gepland',0,'melding','Vervolgplan bestond al; geen dubbele mutaties of mails.');
    end if;
    if j->>'sleutel' is distinct from 'opvolgmail:'||(j->'payload'->>'communicatieDedup')
      or (j->'payload'->>'communicatieDedup') not like 'job:'||b.id||':%'
      or nullif(j->'payload'->>'automatisering','') is null
      or j->'payload'->>'templateId' in ('booking_confirmed','booking_approved_payment_required',
        'booking_payment_reminder','booking_payment_final_reminder','internal_payment_overdue','aanbetaling_check_paul')
      then raise exception 'Onjuiste vervolgmail voor deze boeking.'; end if;
  end loop;
  for m in select value from jsonb_array_elements(p_mutaties) loop
    if m->>'soort' not in ('insert_token','upsert_job','upsert_taak')
      or (m->'velden'->>'boeking_id') is distinct from b.id::text
      then raise exception 'Vervolgplanning mag alleen tokens, taken en mail voor deze boeking vastleggen.'; end if;
  end loop;
  perform public.pas_continuiteit_mutaties(p_mutaties);
  for j in select value from jsonb_array_elements(p_berichten) loop
    perform public.verhuur_plan_stap(b.aanvraag_id,b.id,'opvolgmail',j->>'sleutel',j->'payload');
    v_aantal:=v_aantal+1;
  end loop;
  return jsonb_build_object('gepland',v_aantal);
end;
$$;
revoke all on function public.verhuur_plan_opvolging(bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.verhuur_plan_opvolging(bigint,jsonb,jsonb) to service_role;

create or replace function public.verhuur_opvolgstatus()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.taak='opvolgmail' and (new.status is distinct from old.status or new.provider_id is distinct from old.provider_id) then
    update public.communicatie_jobs set
      status=(case when new.status='afgerond' and new.provider_id is not null then 'verzonden'
        when new.status='geannuleerd' then 'geannuleerd' else 'geblokkeerd' end)::public.communicatie_status,
      foutmelding=new.last_fout,laatste_poging_op=now()
      where dedup_sleutel=new.payload->>'communicatieDedup' and boeking_id=new.boeking_id
        and status::text<>'verzonden';
  end if;
  return new;
end;
$$;
revoke all on function public.verhuur_opvolgstatus() from public,anon,authenticated;
create trigger verhuur_opvolgstatus_na_update after update on public.verhuur_proces_jobs
for each row execute function public.verhuur_opvolgstatus();

-- De bestaande agendafunctie houdt zijn sessierecht en krijgt uitsluitend een
-- extra ingang voor een actuele, toegewezen machineboeking.
create or replace function public.agenda_bezet_voor_definitieve_boeking(p_boeking_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_boeking_id is null then return; end if;
  if ((auth.uid() is not null and app.heeft_recht('boekingen','schrijven'))
      or public.verhuur_machine_mag(p_boeking_id,null)) is not true then
    raise exception 'Geen recht om de agenda te blokkeren.' using errcode='42501'; end if;
  perform 1 from public.boekingen where id=p_boeking_id for share;
  insert into public.publieke_activiteiten(boeking_id,titel,start_datum,eind_datum,zichtbaarheid,gepubliceerd,exposanten,legacy_source)
  select b.id,coalesce(nullif(btrim(b.interne_titel),''),'Bezet'),b.start_datum,b.eind_datum,'bezet',false,
    nullif(btrim(b.huurder_naam_snapshot),''),'beheer'
  from public.boekingen b where b.id=p_boeking_id and b.status::text='definitief'
    and not exists(select 1 from public.publieke_activiteiten p where p.boeking_id=b.id);
end;
$$;
revoke all on function public.agenda_bezet_voor_definitieve_boeking(bigint) from public,anon;
grant execute on function public.agenda_bezet_voor_definitieve_boeking(bigint) to authenticated,service_role;
