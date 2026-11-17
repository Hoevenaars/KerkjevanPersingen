-- Handmatige planningmail naar gastbegeleiders.
-- Geen cron en geen trigger die zelf mail verstuurt.
-- Bestaande boekingen, toewijzingen en schakelaars blijven staan.

create table if not exists public.planning_mail_verzendingen (
  id bigint generated always as identity primary key,
  token text not null,
  periode_van date not null,
  periode_tot date not null,
  created_at timestamptz not null default now(),
  verzonden_op timestamptz,
  gestart_door_id uuid,
  gestart_door_naam text not null,
  status text not null,
  planning_hash text not null,
  snapshot jsonb not null,
  ontvangers_aantal integer not null,
  gelukt_aantal integer not null default 0,
  toelichting text not null default '',
  constraint planning_mail_token unique (token),
  constraint planning_mail_status check (status in ('bezig', 'verzonden', 'deels', 'mislukt')),
  constraint planning_mail_periode check (periode_van <= periode_tot),
  constraint planning_mail_aantallen check (ontvangers_aantal >= 0 and gelukt_aantal >= 0)
);

create unique index if not exists planning_mail_een_bezig
  on public.planning_mail_verzendingen (planning_hash)
  where status = 'bezig';

create index if not exists planning_mail_verzonden_op_idx
  on public.planning_mail_verzendingen (created_at desc);

create table if not exists public.planning_mail_ontvangers (
  id bigint generated always as identity primary key,
  verzending_id bigint not null references public.planning_mail_verzendingen (id) on delete cascade,
  relatie_id bigint,
  naam text not null,
  email text not null,
  status text not null,
  provider_bericht_id text not null default '',
  foutmelding text not null default '',
  persoonlijke_dienst_ids jsonb not null default '[]'::jsonb,
  constraint planning_mail_ontvanger_uniek unique (verzending_id, email),
  constraint planning_mail_ontvanger_status check (status in ('wacht', 'verzonden', 'fout'))
);

create index if not exists planning_mail_ontvangers_verzending_idx
  on public.planning_mail_ontvangers (verzending_id);

alter table public.planning_mail_verzendingen enable row level security;
alter table public.planning_mail_ontvangers enable row level security;

revoke all on table public.planning_mail_verzendingen from anon, authenticated;
revoke all on table public.planning_mail_ontvangers from anon, authenticated;

grant select on table public.planning_mail_verzendingen to authenticated;
grant select on table public.planning_mail_ontvangers to authenticated;
grant all on table public.planning_mail_verzendingen to service_role;
grant all on table public.planning_mail_ontvangers to service_role;
grant usage, select on sequence public.planning_mail_verzendingen_id_seq to service_role;
grant usage, select on sequence public.planning_mail_ontvangers_id_seq to service_role;

drop policy if exists planning_mail_verzendingen_select on public.planning_mail_verzendingen;
create policy planning_mail_verzendingen_select on public.planning_mail_verzendingen
  for select to authenticated
  using ((select app.heeft_recht('planning', 'lezen')));

drop policy if exists planning_mail_ontvangers_select on public.planning_mail_ontvangers;
create policy planning_mail_ontvangers_select on public.planning_mail_ontvangers
  for select to authenticated
  using ((select app.heeft_recht('planning', 'lezen')));

insert into public.automatiseringen (
  sleutel,
  naam,
  omschrijving,
  categorie,
  status,
  mailcategorie,
  trigger_tekst,
  actieve_trigger,
  ontvangerstype,
  risicovol
) values (
  'planning_mail',
  'Planning naar gastbegeleiders',
  'Handmatige planningmail vanaf Gastbegeleiders. Periode, voorbeeld en opslaan versturen niets. Alleen de bevestigde knop Planning verzenden stuurt mail. Er is geen cron.',
  'handmatig',
  'actief',
  'handmatig',
  'Knop Planning verzenden, na extra bevestiging',
  true,
  'Actieve gastbegeleiders',
  true
)
on conflict (sleutel) do nothing;

comment on table public.planning_mail_verzendingen is
  'Handmatig verstuurde planningmail. Een rij ontstaat pas na de bevestigde knop. Geen cron.';
