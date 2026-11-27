-- Eén bestuursbesluit, inclusief prijs en beleidswaarschuwingen.
-- Alleen nieuwe, expliciet geactiveerde dossiers. Geen mails vanuit SQL.
-- De publieke beschikbaarheid/formuliervelden en de algemene tarieven blijven gelijk.

insert into public.instellingen (sleutel, groep, waarde, toelichting)
values ('verhuur_machine', 'verhuur', '{"actief":false,"vanaf":null,"historieCompleet":false,"beleid":{"maanden":18,"grondslag":"einde_begin","versie":"expositie-18m-einde-begin-v1"}}',
        'Eén bestuursbesluit. Activeer met een expliciete startdatum; historische dossiers worden niet ingehaald.')
on conflict (sleutel) do nothing;

-- Een teruggedraaide inhoudswijziging krijgt eveneens een nieuwe beslisversie.
alter table public.aanvragen add column verhuur_revisie bigint not null default 1;

create table public.verhuur_besluiten (
  aanvraag_id bigint primary key references public.aanvragen(id) on delete restrict,
  aanvraag_versie text not null,
  besluit text not null check (besluit in ('ja','nee')),
  huurprijs_euro numeric(10,2),
  prijs_bron text check (prijs_bron in ('tarief','bestuur')),
  actor_label text not null,
  actor_id uuid,
  waarschuwingen jsonb not null default '[]',
  beleid jsonb not null default '{}',
  contract_profiel jsonb,
  vastgelegd_op timestamptz not null default now(),
  boeking_id bigint references public.boekingen(id),
  status text not null check (status in ('wacht_op_beschikbaarheid','toegewezen','herbeoordelen','afgewezen','geannuleerd')),
  blokkade_reden text,
  check (besluit <> 'ja' or (huurprijs_euro > 0 and prijs_bron is not null))
);

create table public.verhuur_besluit_historie (
  id bigint generated always as identity primary key,
  aanvraag_id bigint not null references public.aanvragen(id) on delete restrict,
  aanvraag_versie text not null,
  besluit jsonb not null,
  vastgelegd_op timestamptz not null default now(),
  unique (aanvraag_id, aanvraag_versie)
);

create table public.verhuur_beslislinks (
  id uuid primary key default gen_random_uuid(),
  aanvraag_id bigint not null references public.aanvragen(id) on delete restrict,
  aanvraag_versie text not null,
  ontvanger text not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  geldig_tot timestamptz not null,
  aangemaakt_op timestamptz not null default now(),
  verbruikt_op timestamptz,
  ingetrokken_op timestamptz,
  uitkomst text check (uitkomst in ('ja','nee')),
  unique (aanvraag_id, aanvraag_versie, ontvanger)
);

create table public.verhuur_proces_jobs (
  id uuid primary key default gen_random_uuid(),
  aanvraag_id bigint references public.aanvragen(id) on delete restrict,
  boeking_id bigint references public.boekingen(id) on delete restrict,
  taak text not null check (taak in ('bestuursmail','contract','controleer_definitief','afwijzingsmail','definitiefmail','ondertekenbevestiging','agenda','financieel','hervatten')),
  sleutel text not null unique,
  status text not null default 'te_doen' check (status in ('te_doen','bezig','afgerond','wacht_op_mens','onzeker','geannuleerd')),
  payload jsonb not null default '{}',
  resultaat jsonb not null default '{}',
  pogingen integer not null default 0,
  gepland_op timestamptz not null default now(),
  claim_token uuid,
  geclaimd_op timestamptz,
  bijgewerkt_op timestamptz not null default now(),
  last_fout text,
  provider_id text,
  verantwoordelijke text not null default 'Bestuur',
  opvolgen_voor timestamptz,
  aangemaakt_op timestamptz not null default now()
);
create index verhuur_jobs_open on public.verhuur_proces_jobs(status, gepland_op);
create index verhuur_jobs_aanvraag on public.verhuur_proces_jobs(aanvraag_id);
create index verhuur_besluiten_boeking on public.verhuur_besluiten(boeking_id);

alter table public.verhuur_besluiten enable row level security;
alter table public.verhuur_besluit_historie enable row level security;
alter table public.verhuur_beslislinks enable row level security;
alter table public.verhuur_proces_jobs enable row level security;
revoke all on public.verhuur_besluiten,public.verhuur_besluit_historie,public.verhuur_beslislinks,public.verhuur_proces_jobs from public,anon,authenticated;
grant all on public.verhuur_besluiten,public.verhuur_besluit_historie,public.verhuur_beslislinks,public.verhuur_proces_jobs to service_role;
grant usage,select on sequence public.verhuur_besluit_historie_id_seq to service_role;
grant select on public.verhuur_besluiten,public.verhuur_besluit_historie,public.verhuur_proces_jobs to authenticated;
create policy verhuur_besluiten_lezen on public.verhuur_besluiten for select to authenticated using ((select app.heeft_recht('aanvragen','lezen')));
create policy verhuur_historie_lezen on public.verhuur_besluit_historie for select to authenticated using ((select app.heeft_recht('aanvragen','lezen')));
create policy verhuur_jobs_lezen on public.verhuur_proces_jobs for select to authenticated using ((select app.heeft_recht('aanvragen','lezen')));

-- Precies dezelfde betekenisvolle velden voor tokenversie en wijzigingstrigger.
-- Uploadsluiting, zoekindex, status en interne opvolgvelden wijzigen geen mandaat.
create or replace function public.verhuur_aanvraag_gegevens(a public.aanvragen)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'id',(a).id,'inhoud_revisie',(a).verhuur_revisie,'naam',(a).naam,'email',lower(btrim((a).email)),
    'telefoon',coalesce((a).telefoon,''),'adres',coalesce((a).adres,''),
    'straat',coalesce((a).straat,''),'huisnummer',coalesce((a).huisnummer,''),
    'toevoeging',coalesce((a).huisnummer_toevoeging,''),'postcode',coalesce((a).postcode,''),'woonplaats',coalesce((a).woonplaats,''),
    'soort',(a).verhuurtype_sleutel,'start',(a).start_datum,'eind',(a).eind_datum,
    'personen',coalesce((a).aantal_personen,''),'toelichting',coalesce((a).toelichting,''),
    'website',coalesce((a).website,''),'mede',coalesce((a).mede_exposanten,''),
    'eerder',coalesce((a).eerder_geexposeerd,''),'voorwaarden',(a).akkoord_voorwaarden,'relatie',(a).relatie_id);
$$;
create or replace function public.verhuur_verhoog_aanvraagversie()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (public.verhuur_aanvraag_gegevens(new)-'inhoud_revisie') is distinct from
     (public.verhuur_aanvraag_gegevens(old)-'inhoud_revisie') then
    new.verhuur_revisie:=old.verhuur_revisie+1;
  else new.verhuur_revisie:=old.verhuur_revisie;
  end if;
  return new;
end;
$$;
create trigger z_verhuur_aanvraagversie before update on public.aanvragen
for each row execute function public.verhuur_verhoog_aanvraagversie();

create or replace function public.verhuur_aanvraag_versie(p_id bigint)
returns text language sql stable security definer set search_path = '' as $$
  select encode(sha256(convert_to(public.verhuur_aanvraag_gegevens(a)::text,'UTF8')),'hex')
  from public.aanvragen a where a.id=p_id;
$$;

create or replace function public.verhuur_historie_onwijzigbaar()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Een vastgelegd bestuursbesluit blijft bewaard. Leg een nieuw besluit vast.';
end;
$$;
create trigger verhuur_historie_bewaren before update or delete on public.verhuur_besluit_historie
for each row execute function public.verhuur_historie_onwijzigbaar();

create or replace function public.verhuur_machine_in_scope(p_id bigint)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v jsonb; a public.aanvragen%rowtype;
begin
  select waarde into v from public.instellingen where sleutel='verhuur_machine';
  if coalesce((v->>'actief')::boolean,false) is not true or nullif(v->>'vanaf','') is null then return false; end if;
  select * into a from public.aanvragen where id=p_id;
  return found and a.binnengekomen_op >= (case when v->>'vanaf' ~ '^\d{4}-\d{2}-\d{2}$'
    then (v->>'vanaf')::timestamp at time zone 'Europe/Amsterdam' else (v->>'vanaf')::timestamptz end)
    and a.legacy_source is null;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then return false;
end;
$$;

-- Eén bron voor mail, bevestigingspagina en transactionele hercontrole.
create or replace function public.verhuur_beoordelingsbron(p_aanvraag_id bigint)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare a public.aanvragen%rowtype; v jsonb; v_maanden integer:=18; v_beleid text;
begin
  if coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role' is distinct from 'service_role'
     and (auth.uid() is null or (select app.heeft_recht('aanvragen','schrijven')) is not true) then
    raise exception 'Geen recht op deze beoordeling.' using errcode='42501';
  end if;
  select * into a from public.aanvragen where id=p_aanvraag_id;
  if not found then raise exception 'Aanvraag niet gevonden.' using errcode='P0002'; end if;
  select waarde->'beleid'->>'maanden' into v_beleid from public.instellingen where sleutel='verhuur_machine';
  if v_beleid ~ '^[0-9]{1,3}$' then
    if v_beleid::integer between 1 and 120 then v_maanden:=v_beleid::integer; end if;
  end if;
  v:=jsonb_build_object(
    'aanvraag',to_jsonb(a)-'zoek'-'importpayload'-'foto_upload_token',
    'aanvraag_versie',public.verhuur_aanvraag_versie(a.id),
    'foto_upload_open',a.foto_upload_token is not null,
    'fotos',coalesce((select jsonb_agg(jsonb_build_object('naam',f.bestandsnaam) order by f.id) from public.aanvraag_fotos f where f.aanvraag_id=a.id),'[]'),
    'aanvragen',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'status',r.status,'naam',r.naam,'email',r.email,
       'start_datum',r.start_datum,'eind_datum',r.eind_datum,'boeking_id',r.boeking_id,'binnengekomen_op',r.binnengekomen_op,
       'relatie_id',r.relatie_id,'mede_exposanten',r.mede_exposanten,'verhuurtype_sleutel',r.verhuurtype_sleutel) order by r.id)
       from public.aanvragen r where r.id<>a.id and (a.start_datum is null or a.eind_datum is null
       or r.start_datum is null or r.eind_datum is null
       or (r.start_datum<=a.eind_datum+make_interval(months=>v_maanden)
       and r.eind_datum>=a.start_datum-make_interval(months=>v_maanden)))),'[]'),
    'boekingen',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'nummer',b.nummer,'status',b.status,
       'start_datum',b.start_datum,'eind_datum',b.eind_datum,'aanvraag_id',b.aanvraag_id,'huurder_relatie_id',b.huurder_relatie_id,
       'huurder_naam_snapshot',b.huurder_naam_snapshot,'huurder_email_snapshot',b.huurder_email_snapshot,
       'mede_exposanten',b.mede_exposanten,'verhuurtype_sleutel',b.verhuurtype_sleutel) order by b.id)
       from public.boekingen b where a.start_datum is null or a.eind_datum is null
       or b.start_datum is null or b.eind_datum is null
       or (b.start_datum<=a.eind_datum+make_interval(months=>v_maanden)
       and b.eind_datum>=a.start_datum-make_interval(months=>v_maanden))),'[]'),
    'activiteiten',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'titel',coalesce(r.titel,r.interne_titel),
       'start_datum',r.start_datum,'eind_datum',r.eind_datum,'zichtbaarheid',r.zichtbaarheid,'levenscyclus',r.levenscyclus,
       'annulering',coalesce(r.lokale_override,'{}')?'annulering') order by r.id)
       from public.activiteit_bron r where a.start_datum is null or a.eind_datum is null or r.start_datum is null or r.eind_datum is null or (r.start_datum<=a.eind_datum and r.eind_datum>=a.start_datum)),'[]'),
    'blokkades',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'titel',r.titel,'start_datum',r.start_datum,
       'eind_datum',r.eind_datum,'blokkeert_verhuurkalender',r.blokkeert_verhuurkalender) order by r.id)
       from public.interne_activiteiten r where a.start_datum is null or a.eind_datum is null or r.start_datum is null or r.eind_datum is null or (r.start_datum<=a.eind_datum and r.eind_datum>=a.start_datum)),'[]'),
    'tarieven',coalesce((select jsonb_agg(to_jsonb(t)-'id' order by t.geldig_vanaf) from public.tarieven t
       where t.verhuurtype_sleutel=a.verhuurtype_sleutel),'[]'),
    'instellingen',coalesce((select jsonb_object_agg(s.sleutel,s.waarde) from public.instellingen s
       where s.sleutel in ('verhuur_machine','verhuur_autocontract_profielen')),'{}')
  );
  return v||jsonb_build_object('bron_versie',encode(sha256(convert_to(v::text,'UTF8')),'hex'));
end;
$$;

create or replace function public.verhuur_plan_stap(p_aanvraag_id bigint,p_boeking_id bigint,p_taak text,p_sleutel text,
 p_payload jsonb default '{}',p_gepland_op timestamptz default now())
returns uuid language plpgsql security definer set search_path = '' as $$
declare v uuid; v_status text;
begin
  if p_boeking_id is not null then
    select status::text into v_status from public.boekingen where id=p_boeking_id for share;
    if not found or v_status in ('geannuleerd','afgewezen','afgerond','gearchiveerd') then return null; end if;
  end if;
  insert into public.verhuur_proces_jobs(aanvraag_id,boeking_id,taak,sleutel,payload,gepland_op)
  values(p_aanvraag_id,p_boeking_id,p_taak,p_sleutel,coalesce(p_payload,'{}'),p_gepland_op)
  on conflict(sleutel) do nothing returning id into v;
  if v is null then select id into v from public.verhuur_proces_jobs where sleutel=p_sleutel; end if;
  return v;
end;
$$;

create or replace function public.verhuur_machine_mag(p_boeking_id bigint,p_aanvraag_id bigint default null)
returns boolean language sql stable security definer set search_path = '' as $$
 select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role'='service_role'
 and exists(select 1 from public.verhuur_besluiten d join public.boekingen b on b.id=d.boeking_id
   where b.id=p_boeking_id and (p_aanvraag_id is null or d.aanvraag_id=p_aanvraag_id)
   and b.aanvraag_id=d.aanvraag_id and d.besluit='ja' and d.status='toegewezen'
   and d.aanvraag_versie=public.verhuur_aanvraag_versie(d.aanvraag_id)
   and b.status::text in ('optie','definitief') and b.tarief_bedrag=d.huurprijs_euro
   and public.verhuur_machine_in_scope(d.aanvraag_id));
$$;

-- datumkeuze is afzonderlijk van het inhoudelijke akkoord. Alleen een echte
-- ingelogde bestuurder kan expliciet voorrang geven boven andere losse aanvragen.
create or replace function public.verhuur_wijs_datum_toe(p_aanvraag_id bigint,p_bewuste_toewijzing boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.aanvragen%rowtype; d public.verhuur_besluiten%rowtype; v_id bigint; v_job uuid; v_reden text; v_vandaag date:=(now() at time zone 'Europe/Amsterdam')::date;
begin
  p_bewuste_toewijzing:=coalesce(p_bewuste_toewijzing,false);
  if p_bewuste_toewijzing then
    if auth.uid() is null or (select app.heeft_recht('aanvragen','schrijven')) is not true or (select app.heeft_recht('instellingen','schrijven')) is not true then
      raise exception 'Alleen het bestuur kan deze datum toewijzen.' using errcode='42501';
    end if;
  elsif coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role' is distinct from 'service_role'
    and (auth.uid() is null or (select app.heeft_recht('aanvragen','schrijven')) is not true or (select app.heeft_recht('instellingen','schrijven')) is not true) then
    raise exception 'Geen recht op datumtoewijzing.' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(872501,1);
  select * into a from public.aanvragen where id=p_aanvraag_id for update;
  select * into d from public.verhuur_besluiten where aanvraag_id=p_aanvraag_id for update;
  if not found or d.besluit<>'ja' or d.status not in ('wacht_op_beschikbaarheid','toegewezen')
     or d.aanvraag_versie is distinct from public.verhuur_aanvraag_versie(a.id) or not public.verhuur_machine_in_scope(a.id) then
    raise exception 'Een geldig bestuursakkoord ontbreekt.' using errcode='P0001';
  end if;
  if d.boeking_id is not null then return jsonb_build_object('ok',true,'boekingId',d.boeking_id,'alVerwerkt',true); end if;
  if a.boeking_id is not null then raise exception 'Dit dossier heeft al een boeking; controleer de bestaande afspraken.'; end if;
  if a.start_datum is null or a.eind_datum is null or a.eind_datum<a.start_datum then raise exception 'De periode is onvolledig.'; end if;
  if exists(select 1 from public.boekingen b where b.status::text in ('optie','definitief','optie_verlopen','migratie_vastgelegd')
     and (b.start_datum is null or b.eind_datum is null)) then v_reden:='Een reservering mist datums; beschikbaarheid moet worden gecontroleerd.';
  elsif exists(select 1 from public.interne_activiteiten i where i.blokkeert_verhuurkalender and (i.start_datum is null or i.eind_datum is null)) then v_reden:='Een interne blokkade mist datums.';
  elsif exists(select 1 from public.activiteit_bron r where (r.start_datum is null or r.eind_datum is null) and
     ((r.zichtbaarheid::text='publiek' and coalesce(r.levenscyclus::text,'actief')<>'geannuleerd') or
      (r.zichtbaarheid::text='bezet' and not(coalesce(r.lokale_override,'{}')?'annulering')))) then v_reden:='Een blokkerende activiteit mist datums.';
  elsif exists(select 1 from public.boekingen b where b.status::text in ('optie','definitief','optie_verlopen','migratie_vastgelegd')
     and b.start_datum<=a.eind_datum and b.eind_datum>=a.start_datum) then v_reden:='De periode is al gereserveerd.';
  elsif exists(select 1 from public.interne_activiteiten i where i.blokkeert_verhuurkalender and i.start_datum<=a.eind_datum and i.eind_datum>=a.start_datum) then v_reden:='De periode is intern geblokkeerd.';
  elsif exists(select 1 from public.activiteit_bron r where r.start_datum<=a.eind_datum and r.eind_datum>=a.start_datum and
     ((r.zichtbaarheid::text='publiek' and coalesce(r.levenscyclus::text,'actief')<>'geannuleerd') or
      (r.zichtbaarheid::text='bezet' and not(coalesce(r.lokale_override,'{}')?'annulering')))) then v_reden:='De periode heeft een blokkerende activiteit.';
  elsif exists(select 1 from public.aanvragen r where r.id<>a.id and r.status::text in ('nieuw','in_behandeling','wacht_op_aanvrager','goedgekeurd')
      and (r.start_datum is null or r.eind_datum is null)) then v_reden:='Een actieve aanvraag mist datums. Controleer de beschikbaarheid in het dossier.';
  elsif not p_bewuste_toewijzing and exists(select 1 from public.aanvragen r where r.id<>a.id
     and r.status::text in ('nieuw','in_behandeling','wacht_op_aanvrager','goedgekeurd')
     and r.start_datum<=a.eind_datum and r.eind_datum>=a.start_datum
     and not exists(select 1 from public.boekingen b where b.id=r.boeking_id and b.status::text in ('geannuleerd','afgewezen','afgerond','gearchiveerd'))) then
    v_reden:='Er loopt al een aanvraag. Het bestuur moet de periode toewijzen.';
  end if;
  if v_reden is not null then
    update public.verhuur_besluiten set status='wacht_op_beschikbaarheid',blokkade_reden=v_reden where aanvraag_id=a.id;
    v_job:=public.verhuur_plan_stap(a.id,null,'hervatten','toewijzing:'||a.id||':'||d.aanvraag_versie);
    update public.verhuur_proces_jobs set status='wacht_op_mens',verantwoordelijke='Bestuur',opvolgen_voor=coalesce(opvolgen_voor,now()+interval '7 days'),last_fout=v_reden
      where id=v_job and status not in ('afgerond','geannuleerd');
    return jsonb_build_object('ok',true,'wacht',true,'melding',v_reden);
  end if;
  insert into public.boekingen(nummer,status,verhuurtype_sleutel,interne_titel,start_datum,eind_datum,huurder_relatie_id,aanvraag_id,
    huurder_naam_snapshot,huurder_email_snapshot,huurder_telefoon_snapshot,huurder_adres_snapshot,aantal_personen,toelichting,website,mede_exposanten,
    tarief_bedrag,tarief_prijstype,tarief_vastgelegd_op,optie_aangemaakt_op,optietermijn_dagen,optie_einddatum)
  values('KVP-'||to_char(a.start_datum,'YYYYMMDD')||'-'||a.id,'optie',a.verhuurtype_sleutel,a.naam,a.start_datum,a.eind_datum,a.relatie_id,a.id,
    a.naam,a.email,a.telefoon,a.adres,a.aantal_personen,a.toelichting,a.website,a.mede_exposanten,
    d.huurprijs_euro,'vast',v_vandaag,v_vandaag,14,v_vandaag+14) returning id into v_id;
  update public.aanvragen set status='goedgekeurd',boeking_id=v_id where id=a.id;
  update public.verhuur_besluiten set status='toegewezen',boeking_id=v_id,blokkade_reden=null where aanvraag_id=a.id;
  update public.verhuur_proces_jobs set status='afgerond',last_fout=null,bijgewerkt_op=now() where sleutel='toewijzing:'||a.id||':'||d.aanvraag_versie;
  perform public.verhuur_plan_stap(a.id,v_id,'contract','contract:'||a.id||':'||d.aanvraag_versie);
  if p_bewuste_toewijzing then
    insert into public.auditlog(actor_id,actor_type,actor_naam,onderwerp_type,onderwerp_id,actie,reden)
    values(auth.uid(),'gebruiker','Bestuur','aanvraag',a.id::text,'datum_toegewezen','Bestuur heeft deze aanvraag expliciet de periode toegewezen.');
  end if;
  return jsonb_build_object('ok',true,'boekingId',v_id,'alVerwerkt',false);
end;
$$;

-- Opnieuw kijken wanneer een concurrerend dossier vervalt en vanuit de cron.
-- Overgebleven concurrerende aanvragen blijven blokkeren: er is geen FIFO-keuze.
create or replace function public.verhuur_wek_wachtenden(p_gebeurtenis text)
returns integer language plpgsql security definer set search_path = '' as $$
declare d record; v_teller integer:=0;
begin
  for d in select aanvraag_id,aanvraag_versie from public.verhuur_besluiten
      where status='wacht_op_beschikbaarheid' and besluit='ja' and boeking_id is null
      and public.verhuur_machine_in_scope(aanvraag_id) loop
    perform public.verhuur_plan_stap(d.aanvraag_id,null,'hervatten',
      'beschikbaarheid:'||d.aanvraag_id||':'||d.aanvraag_versie||':'||p_gebeurtenis);
    v_teller:=v_teller+1;
  end loop;
  return v_teller;
end;
$$;

create or replace function public.verhuur_neem_besluit(p_aanvraag_id bigint,p_aanvraag_versie text,p_bron_versie text,p_besluit text,
  p_huurprijs_euro numeric default null,p_waarschuwingen jsonb default '[]',p_beleid jsonb default '{}',p_token_hash text default null,p_reden text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.aanvragen%rowtype; d public.verhuur_besluiten%rowtype; l public.verhuur_beslislinks%rowtype;
 v_actor text; v_prijs numeric(10,2); v_bron text; v jsonb; v_tarief public.tarieven%rowtype;
begin
  perform pg_advisory_xact_lock(872501,1);
  select * into a from public.aanvragen where id=p_aanvraag_id for update;
  if not found or not public.verhuur_machine_in_scope(a.id) then raise exception 'Dit dossier valt niet onder de geactiveerde verhuurmachine.'; end if;
  if p_token_hash is not null then
    if coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role' is distinct from 'service_role' then raise exception 'Geen recht op deze beslislink.' using errcode='42501'; end if;
    select * into l from public.verhuur_beslislinks where token_hash=p_token_hash and aanvraag_id=a.id for update;
    if not found or l.geldig_tot<=now() or l.ingetrokken_op is not null or l.aanvraag_versie<>p_aanvraag_versie then raise exception 'Deze beslislink is niet meer geldig.'; end if;
    v_actor:='Bestuursmailbox: '||l.ontvanger;
  else
    if auth.uid() is null or (select app.heeft_recht('aanvragen','schrijven')) is not true or (select app.heeft_recht('instellingen','schrijven')) is not true then
      raise exception 'Geen recht op een bestuursbesluit.' using errcode='42501'; end if;
    v_actor:='Beheerder '||auth.uid()::text;
  end if;
  if p_besluit not in ('ja','nee') then raise exception 'Kies Ja of Nee.'; end if;
  select * into d from public.verhuur_besluiten where aanvraag_id=a.id for update;
  if found and d.aanvraag_versie=p_aanvraag_versie and d.status<>'herbeoordelen' then
    return jsonb_build_object('ok',true,'alVerwerkt',true,'besluit',d.besluit,'status',d.status,'boekingId',d.boeking_id);
  end if;
  if l.verbruikt_op is not null then raise exception 'Deze link is al gebruikt.'; end if;
  if public.verhuur_aanvraag_versie(a.id) is distinct from p_aanvraag_versie then raise exception 'De aanvraag is gewijzigd. Bekijk de actuele gegevens opnieuw.'; end if;
  v:=public.verhuur_beoordelingsbron(a.id);
  if v->>'bron_versie' is distinct from p_bron_versie then raise exception 'De beoordeling is gewijzigd. Bekijk de actuele waarschuwingen opnieuw.'; end if;
  if a.boeking_id is not null then raise exception 'Dit dossier heeft al een contracttraject. Beoordeel de wijziging in het bestaande dossier.'; end if;
  if a.status::text not in ('nieuw','in_behandeling','wacht_op_aanvrager') then raise exception 'Deze aanvraag kan nu niet worden beoordeeld.'; end if;
  if p_besluit='ja' then
    if a.verhuurtype_sleutel in ('concert','diverse') then v_prijs:=p_huurprijs_euro; v_bron:='bestuur';
    else
      select * into v_tarief from public.tarieven t where t.verhuurtype_sleutel=a.verhuurtype_sleutel and t.geldig_vanaf<=a.start_datum
        and (t.geldig_tot is null or t.geldig_tot>=a.start_datum) order by t.geldig_vanaf desc limit 1;
      if not found or v_tarief.prijstype::text<>'vast' then raise exception 'Er ontbreekt een vast tarief voor dit verhuurtype.'; end if;
      v_prijs:=v_tarief.bedrag; v_bron:='tarief';
      if p_huurprijs_euro is distinct from v_prijs then raise exception 'De getoonde prijs is gewijzigd. Bekijk de aanvraag opnieuw.'; end if;
    end if;
    if v_prijs is null or v_prijs<=0 or p_huurprijs_euro<>round(p_huurprijs_euro,2) then raise exception 'Vul een geldige huurprijs met maximaal twee decimalen in.'; end if;
  end if;
  insert into public.verhuur_besluiten(aanvraag_id,aanvraag_versie,besluit,huurprijs_euro,prijs_bron,actor_label,actor_id,waarschuwingen,beleid,contract_profiel,status)
  values(a.id,p_aanvraag_versie,p_besluit,v_prijs,v_bron,v_actor,auth.uid(),coalesce(p_waarschuwingen,'[]'),coalesce(p_beleid,'{}'),
      v->'instellingen'->'verhuur_autocontract_profielen'->a.verhuurtype_sleutel,
      case when p_besluit='ja' then 'wacht_op_beschikbaarheid' else 'afgewezen' end)
  on conflict(aanvraag_id) do update set aanvraag_versie=excluded.aanvraag_versie,besluit=excluded.besluit,
      huurprijs_euro=excluded.huurprijs_euro,prijs_bron=excluded.prijs_bron,actor_label=excluded.actor_label,actor_id=excluded.actor_id,
      waarschuwingen=excluded.waarschuwingen,beleid=excluded.beleid,contract_profiel=excluded.contract_profiel,vastgelegd_op=now(),status=excluded.status,blokkade_reden=null;
  insert into public.verhuur_besluit_historie(aanvraag_id,aanvraag_versie,besluit)
    select a.id,p_aanvraag_versie,to_jsonb(r) from public.verhuur_besluiten r where r.aanvraag_id=a.id;
  update public.verhuur_beslislinks set verbruikt_op=now(),uitkomst=p_besluit where aanvraag_id=a.id and aanvraag_versie=p_aanvraag_versie and verbruikt_op is null;
  update public.aanvragen set status=(case when p_besluit='ja' then 'in_behandeling' else 'afgewezen' end)::public.aanvraag_status,
      afwijsreden=case when p_besluit='nee' then coalesce(nullif(btrim(p_reden),''),'De activiteit past niet binnen de mogelijkheden van het Kerkje van Persingen.') else afwijsreden end where id=a.id;
  insert into public.auditlog(actor_id,actor_type,actor_naam,onderwerp_type,onderwerp_id,actie,naar,details,dedup_sleutel)
    values(auth.uid(),case when auth.uid() is null then 'systeem' else 'gebruiker' end,v_actor,'aanvraag',a.id::text,'bestuursbesluit',p_besluit,
    jsonb_build_object('aanvraagVersie',p_aanvraag_versie,'prijs',v_prijs,'beleid',p_beleid,'waarschuwingen',p_waarschuwingen),
    'bestuursbesluit:'||a.id||':'||p_aanvraag_versie);
  if p_besluit='nee' then
    perform public.verhuur_plan_stap(a.id,null,'afwijzingsmail','afwijzing:'||a.id||':'||p_aanvraag_versie);
    perform public.verhuur_wek_wachtenden('afwijzing:'||a.id||':'||p_aanvraag_versie);
    return jsonb_build_object('ok',true,'besluit','nee','status','afgewezen');
  end if;
  v:=public.verhuur_wijs_datum_toe(a.id,false);
  return v||jsonb_build_object('besluit','ja');
end;
$$;

-- Een vergeten foto-upload kan de opgeslagen aanvraag niet onzichtbaar maken.
-- De achtergrondmail wacht kort en noemt een onafgeronde upload als aandachtspunt.
create or replace function public.verhuur_aanvraag_gebeurtenis()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  if tg_op='UPDATE' and public.verhuur_aanvraag_gegevens(new) is not distinct from public.verhuur_aanvraag_gegevens(old) then return new; end if;
  v:=public.verhuur_aanvraag_versie(new.id);
  if tg_op='UPDATE' then
    update public.verhuur_beslislinks set ingetrokken_op=now() where aanvraag_id=new.id and aanvraag_versie<>v and verbruikt_op is null;
    update public.verhuur_besluiten set status='herbeoordelen',blokkade_reden='De aanvraag is gewijzigd; beoordeling vereist.' where aanvraag_id=new.id and aanvraag_versie<>v;
    update public.verhuur_proces_jobs set status='geannuleerd',last_fout='De aanvraag is gewijzigd.' where aanvraag_id=new.id and status in ('te_doen','wacht_op_mens');
    if new.boeking_id is not null and exists(select 1 from public.verhuur_besluiten where aanvraag_id=new.id and status='herbeoordelen') then
      -- Geen bookinglock vanuit een aanvraagtrigger: operationele transacties
      -- vergrendelen boeking vóór aanvraag. Dit is alleen een menselijke taak.
      perform public.verhuur_plan_stap(new.id,null,'contract','herbeoordeling:'||new.id||':'||v,
        jsonb_build_object('herbeoordeling',true,'boekingId',new.boeking_id));
      update public.verhuur_proces_jobs set status='wacht_op_mens',verantwoordelijke='Bestuur / Finance',
        opvolgen_voor=now()+interval '2 days',last_fout='De afspraken zijn gewijzigd. Beoordeel het concrete concept of handel de contract-/factuurcorrectie af.'
        where sleutel='herbeoordeling:'||new.id||':'||v;
    end if;
  end if;
  if public.verhuur_machine_in_scope(new.id) and new.status::text in ('nieuw','in_behandeling','wacht_op_aanvrager') and new.boeking_id is null then
    perform public.verhuur_plan_stap(new.id,null,'bestuursmail','bestuursmail:'||new.id||':'||v,'{}',now()+interval '5 minutes');
  end if;
  return new;
end;
$$;
create trigger verhuur_aanvraag_na_opslag after insert or update on public.aanvragen for each row execute function public.verhuur_aanvraag_gebeurtenis();

create or replace function public.verhuur_boeking_gebeurtenis()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status is distinct from new.status and new.status::text in ('geannuleerd','afgewezen','afgerond','gearchiveerd') then
    perform public.verhuur_wek_wachtenden('vrij:'||new.id||':'||txid_current());
  end if;
  if new.status::text='definitief' and old.status::text is distinct from 'definitief'
     and exists(select 1 from public.verhuur_besluiten d where d.boeking_id=new.id and d.status='toegewezen') then
    perform public.verhuur_plan_stap(new.aanvraag_id,new.id,'definitiefmail','definitief:'||new.id);
    perform public.verhuur_plan_stap(new.aanvraag_id,new.id,'agenda','agenda:'||new.id);
  end if;
  return new;
end;
$$;
create trigger verhuur_boeking_na_status after update of status on public.boekingen for each row execute function public.verhuur_boeking_gebeurtenis();

create or replace function public.verhuur_claim_stappen(p_limiet integer default 10,p_aanvraag_id bigint default null)
returns setof public.verhuur_proces_jobs language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role' is distinct from 'service_role' then raise exception 'Geen procesbevoegdheid.' using errcode='42501'; end if;
  -- Pure stappen kunnen hervatten. Contract/financieel hebben daarnaast
  -- een eigen persistente verzendclaim. Losse ontvangstmail blijft onzeker.
  update public.verhuur_proces_jobs set status=case when pogingen>=5 then 'wacht_op_mens' else 'te_doen' end,
      claim_token=null,bijgewerkt_op=now(),opvolgen_voor=case when pogingen>=5 then now() else opvolgen_voor end,
      last_fout=case when pogingen>=5 then 'De vijfde verwerking is onderbroken. Controleer het dossier en hervat bewust.' else last_fout end
    where status='bezig' and geclaimd_op<now()-interval '15 minutes'
      and (taak in ('contract','controleer_definitief','agenda','financieel','hervatten')
        or (taak='bestuursmail' and not(payload?'ontvanger')));
  -- Na een crash rond een losse mail is de uitkomst onbekend. Niet blind verzenden.
  update public.verhuur_proces_jobs set status='onzeker',last_fout='Verwerking onderbroken. Controleer verzendbewijs voordat u hervat.',
      bijgewerkt_op=now(),opvolgen_voor=now() where status='bezig' and geclaimd_op<now()-interval '15 minutes';
  return query with kandidaten as (
    select j.id from public.verhuur_proces_jobs j where j.status='te_doen' and j.gepland_op<=now()
      and (p_aanvraag_id is null or j.aanvraag_id=p_aanvraag_id) and j.pogingen<5
      and public.verhuur_machine_in_scope(j.aanvraag_id)
      and not exists(select 1 from public.boekingen b where b.id=j.boeking_id and b.status::text in ('geannuleerd','afgewezen','afgerond','gearchiveerd'))
    order by j.gepland_op,j.aangemaakt_op for update skip locked limit least(greatest(p_limiet,1),25)
  ) update public.verhuur_proces_jobs j set status='bezig',claim_token=gen_random_uuid(),geclaimd_op=now(),bijgewerkt_op=now(),pogingen=pogingen+1
    from kandidaten k where j.id=k.id returning j.*;
end;
$$;

create or replace function public.verhuur_rond_stap_af(p_id uuid,p_claim uuid,p_status text,p_resultaat jsonb default '{}',p_fout text default null,p_provider_id text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role' is distinct from 'service_role' then raise exception 'Geen procesbevoegdheid.' using errcode='42501'; end if;
  if p_status not in ('afgerond','te_doen','wacht_op_mens','onzeker','geannuleerd') then raise exception 'Ongeldige processtatus.'; end if;
  update public.verhuur_proces_jobs set status=case when p_status='te_doen' and pogingen>=5 then 'wacht_op_mens' else p_status end,
      resultaat=coalesce(p_resultaat,'{}'),last_fout=p_fout,provider_id=coalesce(p_provider_id,provider_id),bijgewerkt_op=now(),
      gepland_op=case when p_status='te_doen' then now()+make_interval(mins=>least(60,5*pogingen)) else gepland_op end,
      opvolgen_voor=case when p_status in ('wacht_op_mens','onzeker') or pogingen>=5 then now() else null end
    where id=p_id and claim_token=p_claim and status='bezig';
  return found;
end;
$$;

-- Herstel is expliciet. Onzekere mail krijgt eerst providerbewijs, nooit een blinde retry.
create or replace function public.verhuur_herstel_stap(p_id uuid,p_provider_id text default null,p_bewezen_niet_verzonden boolean default false)
returns boolean language plpgsql security definer set search_path = '' as $$
declare j public.verhuur_proces_jobs%rowtype;
begin
  if auth.uid() is null or (select app.heeft_recht('aanvragen','schrijven')) is not true or (select app.heeft_recht('instellingen','schrijven')) is not true then raise exception 'Geen herstelrecht.' using errcode='42501'; end if;
  select * into j from public.verhuur_proces_jobs where id=p_id for update;
  if not found or j.status not in ('wacht_op_mens','onzeker') then return false; end if;
  if j.status='onzeker' and j.taak in ('contract','financieel','ondertekenbevestiging') then raise exception 'Herstel eerst het verzendbewijs per contract, factuur of ontvanger in dit dossier.'; end if;
  if j.status='onzeker' and nullif(btrim(p_provider_id),'') is null and not p_bewezen_niet_verzonden then raise exception 'Controleer eerst het verzendbewijs bij de provider.'; end if;
  if nullif(btrim(p_provider_id),'') is not null then
    if j.taak not in ('bestuursmail','afwijzingsmail','definitiefmail','opvolgmail') then raise exception 'Herstel het contract-/factuurbewijs in het bijbehorende dossier.'; end if;
    update public.verhuur_proces_jobs set status='afgerond',provider_id=p_provider_id,last_fout=null,bijgewerkt_op=now() where id=j.id;
  else
    update public.verhuur_proces_jobs set status='te_doen',pogingen=0,gepland_op=now(),claim_token=null,last_fout=null,bijgewerkt_op=now() where id=j.id;
  end if;
  insert into public.auditlog(actor_id,actor_type,actor_naam,onderwerp_type,onderwerp_id,actie,details)
  values(auth.uid(),'gebruiker','Bestuur','aanvraag',j.aanvraag_id::text,'proces_hersteld',jsonb_build_object('job',j.id,'providerId',p_provider_id,'bewezenNietVerzonden',p_bewezen_niet_verzonden));
  return true;
end;
$$;

revoke all on function public.verhuur_aanvraag_versie(bigint),public.verhuur_machine_in_scope(bigint),public.verhuur_beoordelingsbron(bigint),
 public.verhuur_plan_stap(bigint,bigint,text,text,jsonb,timestamptz),public.verhuur_machine_mag(bigint,bigint),
 public.verhuur_wijs_datum_toe(bigint,boolean),public.verhuur_wek_wachtenden(text),public.verhuur_neem_besluit(bigint,text,text,text,numeric,jsonb,jsonb,text,text),
 public.verhuur_claim_stappen(integer,bigint),public.verhuur_rond_stap_af(uuid,uuid,text,jsonb,text,text),public.verhuur_herstel_stap(uuid,text,boolean),
 public.verhuur_aanvraag_gebeurtenis(),public.verhuur_boeking_gebeurtenis(),
 public.verhuur_aanvraag_gegevens(public.aanvragen),public.verhuur_verhoog_aanvraagversie(),public.verhuur_historie_onwijzigbaar() from public,anon,authenticated;
grant execute on function public.verhuur_aanvraag_versie(bigint),public.verhuur_machine_in_scope(bigint),public.verhuur_beoordelingsbron(bigint),
 public.verhuur_plan_stap(bigint,bigint,text,text,jsonb,timestamptz),public.verhuur_machine_mag(bigint,bigint),
 public.verhuur_wijs_datum_toe(bigint,boolean),public.verhuur_wek_wachtenden(text),public.verhuur_neem_besluit(bigint,text,text,text,numeric,jsonb,jsonb,text,text),
 public.verhuur_claim_stappen(integer,bigint),public.verhuur_rond_stap_af(uuid,uuid,text,jsonb,text,text) to service_role;
grant execute on function public.verhuur_beoordelingsbron(bigint),public.verhuur_machine_in_scope(bigint),public.verhuur_machine_mag(bigint,bigint),
 public.verhuur_wijs_datum_toe(bigint,boolean),public.verhuur_neem_besluit(bigint,text,text,text,numeric,jsonb,jsonb,text,text),
 public.verhuur_herstel_stap(uuid,text,boolean) to authenticated;

-- Serializeer de bestaande intake vóór beschikbaarheid en dedup. Geen wijziging
-- van validatie, formulier, returnvorm of publiek kalendergedrag.
do $$ declare v text; begin
 v:=pg_get_functiondef('public.bewaar_test_aanvraag(text,text,text,text,text,date,date,text,text,text,text,text,boolean,boolean,text,text,text,text,text)'::regprocedure);
 if position('pg_advisory_xact_lock(872501,1)' in v)=0 then
   v:=replace(v,E'begin\n  if nullif(btrim(coalesce(p_naam',E'begin\n  perform pg_advisory_xact_lock(872501,1);\n  if nullif(btrim(coalesce(p_naam');
   if position('pg_advisory_xact_lock(872501,1)' in v)=0 then raise exception 'Intakefunctie wijkt af; plaats de beschikbaarheidslock expliciet voordat de migratie doorgaat.'; end if;
   execute v;
 end if;
end $$;
