-- Continuïteit 3.0: workflowtaken, klanttokens, inhoudsstatus, betalingen,
-- incidenten en dedup. Bestaande tabellen blijven de kapstok.
-- Productiecutover gebeurt niet in deze migratie.

alter type public.aanvraag_status add value if not exists 'wacht_op_aanvrager';

do $$ begin
  create type public.inhoud_status as enum (
    'niet_vereist',
    'niet_gestart',
    'gevraagd',
    'ingediend',
    'wijziging_gevraagd',
    'goedgekeurd'
  );
exception when duplicate_object then null;
end $$;

alter table public.aanvragen
  add column if not exists beoordeling_deadline date,
  add column if not exists informatievraag text,
  add column if not exists informatie_ontvangen_op timestamptz;

alter table public.publieke_activiteiten
  add column if not exists inhoud_status public.inhoud_status not null default 'niet_gestart',
  add column if not exists praktische_informatie text,
  add column if not exists beoordeling_toelichting text,
  add column if not exists ingediend_op timestamptz,
  add column if not exists goedgekeurd_op timestamptz,
  add column if not exists goedgekeurd_door uuid references public.profielen (id),
  add column if not exists inhoud_versie integer not null default 0;

create unique index if not exists publieke_activiteiten_boeking_uniek
  on public.publieke_activiteiten (boeking_id)
  where boeking_id is not null;

-- Definitieve boekingen en opties mogen dezelfde periode niet dubbel bezetten.
-- Historische migratiestatussen vallen erbuiten.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'boekingen_geen_dubbele_bezetting'
  ) then
    alter table public.boekingen
      add constraint boekingen_geen_dubbele_bezetting
      exclude using gist (
        daterange(start_datum, eind_datum, '[]') with &&
      )
      where (status in ('optie', 'definitief'));
  end if;
end $$;

create table if not exists public.workflow_taken (
  id bigint generated always as identity primary key,
  boeking_id bigint references public.boekingen (id) on delete cascade,
  aanvraag_id bigint references public.aanvragen (id) on delete cascade,
  taak_type text not null,
  status text not null default 'open',
  eigenaar_type text not null,
  eigenaar_profiel_id uuid references public.profielen (id),
  deadline date,
  prioriteit integer not null default 50,
  dedup_sleutel text not null,
  toelichting text,
  afgerond_op timestamptz,
  aangemaakt_op timestamptz not null default now(),
  bijgewerkt_op timestamptz not null default now(),
  constraint workflow_taken_status_bekend check (
    status in ('open', 'bezig', 'afgerond', 'geannuleerd', 'geescaleerd')
  ),
  constraint workflow_taken_eigenaar_bekend check (
    eigenaar_type in ('klant', 'bestuur', 'finance', 'planning', 'systeem')
  ),
  constraint workflow_taken_koppeling check (boeking_id is not null or aanvraag_id is not null)
);

create unique index if not exists workflow_taken_dedup_uniek
  on public.workflow_taken (dedup_sleutel);
create index if not exists workflow_taken_boeking_idx on public.workflow_taken (boeking_id, status);
create index if not exists workflow_taken_aanvraag_idx on public.workflow_taken (aanvraag_id, status);
create index if not exists workflow_taken_deadline_idx on public.workflow_taken (deadline)
  where status in ('open', 'bezig', 'geescaleerd');

create table if not exists public.toegangstokens (
  id bigint generated always as identity primary key,
  boeking_id bigint references public.boekingen (id) on delete cascade,
  aanvraag_id bigint references public.aanvragen (id) on delete cascade,
  doel text not null,
  token_hash text not null,
  verloopt_op timestamptz not null,
  ingetrokken_op timestamptz,
  gebruikt_op timestamptz,
  aangemaakt_op timestamptz not null default now(),
  constraint toegangstokens_doel_bekend check (doel in ('content', 'meer_informatie')),
  constraint toegangstokens_koppeling check (boeking_id is not null or aanvraag_id is not null)
);

create unique index if not exists toegangstokens_hash_uniek on public.toegangstokens (token_hash);
create index if not exists toegangstokens_boeking_idx on public.toegangstokens (boeking_id, doel);

create table if not exists public.betalingen (
  id bigint generated always as identity primary key,
  boeking_id bigint not null references public.boekingen (id) on delete cascade,
  soort text not null,
  bedrag numeric(10,2) not null,
  status text not null,
  vervaldatum date,
  ontvangen_op timestamptz,
  referentie text,
  aangemaakt_op timestamptz not null default now(),
  constraint betalingen_soort_bekend check (soort in ('aanbetaling', 'restant', 'correctie', 'restitutie')),
  constraint betalingen_status_bekend check (status in ('open', 'ontvangen', 'geannuleerd'))
);

create unique index if not exists betalingen_aanbetaling_uniek
  on public.betalingen (boeking_id)
  where soort = 'aanbetaling';
create index if not exists betalingen_boeking_idx on public.betalingen (boeking_id, status);

create table if not exists public.incidenten (
  id bigint generated always as identity primary key,
  boeking_id bigint not null references public.boekingen (id) on delete cascade,
  omschrijving text not null,
  status text not null default 'open',
  gemeld_door uuid references public.profielen (id),
  gemeld_op timestamptz not null default now(),
  gesloten_op timestamptz,
  constraint incidenten_status_bekend check (status in ('open', 'opgevolgd', 'gesloten'))
);

create index if not exists incidenten_boeking_idx on public.incidenten (boeking_id, status);

alter table public.communicatie_jobs
  add column if not exists dedup_sleutel text,
  add column if not exists template_sleutel text,
  add column if not exists ontvanger_email text,
  add column if not exists onderwerp text,
  add column if not exists aanvraag_id bigint references public.aanvragen (id) on delete cascade,
  add column if not exists modus text,
  add column if not exists laatste_poging_op timestamptz;

alter table public.communicatie_jobs
  drop constraint if exists communicatie_jobs_modus_bekend;
alter table public.communicatie_jobs
  add constraint communicatie_jobs_modus_bekend
  check (modus is null or modus in ('automatisch', 'concept', 'handmatig'));

create unique index if not exists communicatie_jobs_dedup_uniek
  on public.communicatie_jobs (dedup_sleutel)
  where dedup_sleutel is not null;

create table if not exists public.communicatie_pogingen (
  id bigint generated always as identity primary key,
  job_id bigint not null references public.communicatie_jobs (id) on delete cascade,
  poging integer not null,
  status public.communicatie_status not null,
  foutmelding text,
  op timestamptz not null default now(),
  unique (job_id, poging)
);

alter table public.auditlog
  add column if not exists dedup_sleutel text,
  add column if not exists actor_type text;

create unique index if not exists auditlog_dedup_uniek
  on public.auditlog (dedup_sleutel)
  where dedup_sleutel is not null;

insert into public.instellingen (sleutel, groep, waarde, toelichting) values
  ('beoordeling_deadline_dagen', 'verhuur', '7', 'Technische standaard tot het bestuur een andere beoordelingstermijn vastlegt.'),
  ('toegangstoken_dagen', 'algemeen', '21', 'Geldigheid van een magische klantlink.')
on conflict (sleutel) do nothing;

insert into public.communicatie_templates
  (sleutel, naam, trigger_soort, termijn_waarde, termijn_eenheid, ontvanger_rol, verzendwijze)
values
  ('booking_request_received', 'Aanvraag ontvangen', 'nieuwe_aanvraag', null, null, 'huurder', 'automatisch'),
  ('internal_booking_review_required', 'Nieuwe aanvraag intern', 'aanvraag_compleet', null, null, 'bestuur', 'automatisch'),
  ('booking_more_information_requested', 'Meer informatie nodig', 'besluit_meer_info', null, null, 'huurder', 'concept'),
  ('internal_booking_information_received', 'Aanvulling ontvangen', 'aanvulling_ontvangen', null, null, 'bestuur', 'automatisch'),
  ('booking_request_rejected', 'Aanvraag afgewezen', 'besluit_afwijzing', null, null, 'huurder', 'concept'),
  ('booking_approved_payment_required', 'Aanvraag goedgekeurd', 'besluit_goedkeuring', null, null, 'huurder', 'concept'),
  ('booking_payment_reminder', 'Betalingsherinnering', 'na_optie', 7, 'dagen', 'huurder', 'automatisch'),
  ('booking_payment_final_reminder', 'Laatste betalingsherinnering', 'voor_betaaldeadline', 2, 'dagen', 'huurder', 'automatisch'),
  ('internal_payment_overdue', 'Betaling te laat', 'betaaldeadline', 0, 'dagen', 'finance', 'automatisch'),
  ('booking_confirmed', 'Reservering definitief', 'na_definitief', 0, 'dagen', 'huurder', 'automatisch'),
  ('booking_content_request', 'Informatie aanleveren', 'voor_activiteit', 12, 'weken', 'huurder', 'automatisch'),
  ('booking_content_reminder', 'Reminder informatie', 'voor_activiteit', 10, 'weken', 'huurder', 'automatisch'),
  ('internal_content_overdue', 'Content ontbreekt', 'voor_activiteit', 8, 'weken', 'bestuur', 'automatisch'),
  ('internal_content_review_required', 'Content beoordelen', 'handmatig', null, null, 'bestuur', 'automatisch'),
  ('booking_content_changes_requested', 'Aanpassing gevraagd', 'handmatig', null, null, 'huurder', 'concept'),
  ('booking_content_approved', 'Content akkoord', 'handmatig', null, null, 'huurder', 'concept'),
  ('internal_host_required', 'Gastheer ontbreekt', 'voor_activiteit', 4, 'weken', 'planning', 'automatisch'),
  ('booking_practical_information', 'Praktische informatie', 'voor_activiteit', 4, 'weken', 'huurder', 'automatisch'),
  ('host_practical_information', 'Praktische informatie gastheer', 'voor_activiteit', 4, 'weken', 'gastheer', 'automatisch'),
  ('booking_final_instructions', 'Laatste daginformatie', 'voor_activiteit', 2, 'dagen', 'huurder', 'automatisch'),
  ('host_final_instructions', 'Daginformatie gastheer', 'voor_activiteit', 1, 'dagen', 'gastheer', 'automatisch'),
  ('booking_review_request', 'Review na afloop', 'na_activiteit', 1, 'dagen', 'huurder', 'automatisch'),
  ('host_post_event_check', 'Afloopcheck gastheer', 'na_activiteit', 1, 'dagen', 'gastheer', 'automatisch')
on conflict (sleutel) do nothing;

-- ---------------------------------------------------------------------------
-- RLS. Anon blijft zonder tabelrechten. Klanttoegang loopt via de server.
-- ---------------------------------------------------------------------------

alter table public.workflow_taken enable row level security;
alter table public.toegangstokens enable row level security;
alter table public.betalingen enable row level security;
alter table public.incidenten enable row level security;
alter table public.communicatie_pogingen enable row level security;

grant select, insert, update, delete on public.workflow_taken to authenticated;
grant select, insert, update, delete on public.toegangstokens to authenticated;
grant select, insert, update, delete on public.betalingen to authenticated;
grant select, insert, update, delete on public.incidenten to authenticated;
grant select, insert on public.communicatie_pogingen to authenticated;
grant usage, select on all sequences in schema public to authenticated;

create policy workflow_taken_select on public.workflow_taken
  for select to authenticated
  using (
    (select app.heeft_recht('boekingen', 'lezen'))
    or (select app.heeft_recht('aanvragen', 'lezen'))
  );
create policy workflow_taken_schrijven on public.workflow_taken
  for all to authenticated
  using (
    (select app.heeft_recht('boekingen', 'schrijven'))
    or (select app.heeft_recht('aanvragen', 'schrijven'))
  )
  with check (
    (select app.heeft_recht('boekingen', 'schrijven'))
    or (select app.heeft_recht('aanvragen', 'schrijven'))
  );

create policy toegangstokens_select on public.toegangstokens
  for select to authenticated
  using ((select app.heeft_recht('boekingen', 'lezen')));
create policy toegangstokens_schrijven on public.toegangstokens
  for all to authenticated
  using ((select app.heeft_recht('boekingen', 'schrijven')))
  with check ((select app.heeft_recht('boekingen', 'schrijven')));

create policy betalingen_select on public.betalingen
  for select to authenticated
  using ((select app.heeft_recht('finance', 'lezen')));
create policy betalingen_schrijven on public.betalingen
  for all to authenticated
  using ((select app.heeft_recht('finance', 'schrijven')))
  with check ((select app.heeft_recht('finance', 'schrijven')));

create policy incidenten_select on public.incidenten
  for select to authenticated
  using ((select app.heeft_recht('boekingen', 'lezen')));
create policy incidenten_schrijven on public.incidenten
  for all to authenticated
  using ((select app.heeft_recht('boekingen', 'schrijven')))
  with check ((select app.heeft_recht('boekingen', 'schrijven')));

create policy pogingen_select on public.communicatie_pogingen
  for select to authenticated
  using (
    (select app.heeft_recht('templates', 'lezen'))
    or (select app.heeft_recht('boekingen', 'lezen'))
  );
create policy pogingen_insert on public.communicatie_pogingen
  for insert to authenticated
  with check (
    (select app.heeft_recht('templates', 'schrijven'))
    or (select app.heeft_recht('boekingen', 'schrijven'))
  );

drop view if exists public.v_publieke_agenda;
create view public.v_publieke_agenda
with (security_invoker = true)
as
select
  a.id,
  a.slug,
  a.titel,
  a.omschrijving,
  a.start_datum,
  a.eind_datum,
  a.openingstijden,
  a.website,
  a.foto_pad,
  a.foto_alt
from public.publieke_activiteiten a
where a.gepubliceerd = true
  and a.inhoud_status = 'goedgekeurd';
