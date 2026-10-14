-- Beheer vervolgfase. Backwards-compatible uitbreiding.
-- Wijzigt geen automatiseringsstatus en geen historische dossierrijen.

alter table public.relaties
  add column if not exists organisatie text;

alter table public.relatie_rollen
  add column if not exists actief boolean not null default true;

alter table public.automatiseringen
  add column if not exists actief_vanaf date;

comment on column public.automatiseringen.actief_vanaf is
  'Generieke activatiegrens. Jobs met een trigger vóór deze datum worden niet gestart.';

alter table public.communicatie_verzendingen
  add column if not exists aanvraag_id bigint references public.aanvragen (id) on delete set null,
  add column if not exists template_sleutel text,
  add column if not exists onderwerp text,
  add column if not exists bedoelde_ontvanger text,
  add column if not exists werkelijke_ontvanger text,
  add column if not exists afzender text,
  add column if not exists reply_to text,
  add column if not exists richting text,
  add column if not exists provider_bericht_id text,
  add column if not exists dedup_sleutel text;

alter table public.communicatie_verzendingen
  drop constraint if exists communicatie_verzendingen_richting_bekend;
alter table public.communicatie_verzendingen
  add constraint communicatie_verzendingen_richting_bekend
  check (richting is null or richting in ('inkomend', 'uitgaand', 'systeem'));

create unique index if not exists communicatie_verzendingen_dedup_uniek
  on public.communicatie_verzendingen (dedup_sleutel)
  where dedup_sleutel is not null;

create index if not exists communicatie_verzendingen_aanvraag_idx
  on public.communicatie_verzendingen (aanvraag_id);

alter table public.communicatie_jobs alter column template_id drop not null;

alter table public.communicatie_jobs
  add column if not exists provider_bericht_id text,
  add column if not exists werkelijke_ontvanger text,
  add column if not exists afzender text,
  add column if not exists reply_to text;

alter table public.documenten
  add column if not exists versie integer not null default 1,
  add column if not exists sjabloon_sleutel text,
  add column if not exists merge_velden jsonb;

create table if not exists public.cron_runs (
  id bigint generated always as identity primary key,
  route text not null,
  gestart_op timestamptz not null default now(),
  klaar_op timestamptz,
  status text not null,
  resultaat text
);

alter table public.cron_runs enable row level security;
revoke all on table public.cron_runs from anon, authenticated;

insert into public.instellingen (sleutel, groep, waarde, toelichting)
values (
  'testmailadres',
  'mail',
  to_jsonb('nhoevenaars@gmail.com'::text),
  'Alle echte testmails gaan uitsluitend naar dit adres.'
)
on conflict (sleutel) do nothing;

insert into public.modules (sleutel, naam, volgorde) values
  ('algemene_instellingen', 'Algemene instellingen', 20),
  ('gastheerbeheer', 'Gastheerbeheer', 21),
  ('finance_instellingen', 'Finance-instellingen', 22),
  ('automatiseringen', 'Automatiseringen', 23),
  ('systeembeheer', 'Systeembeheer', 24),
  ('bridge', 'Sanity bridge', 25),
  ('migratie', 'Migratie', 26)
on conflict (sleutel) do nothing;

-- Caller bestaat nu. Alleen de triggervlag, nooit de schakelaar (status).
update public.automatiseringen
set actieve_trigger = true
where sleutel in ('aanvraag_bevestiging', 'reservelijst_mail', 'handmatige_template')
  and actieve_trigger is distinct from true;

create or replace function public.zet_automatisering_status(
  p_sleutel text,
  p_status text,
  p_gebruiker text
) returns void
language plpgsql
set search_path = public
as $$
declare
  oud text;
begin
  if p_status not in ('actief', 'test', 'uit') then
    raise exception 'onbekende status';
  end if;
  select status into oud from public.automatiseringen where sleutel = p_sleutel for update;
  if oud is null then
    raise exception 'onbekende automatisering';
  end if;
  if oud = p_status then
    return;
  end if;
  update public.automatiseringen
    set status = p_status,
        gewijzigd_door = p_gebruiker,
        gewijzigd_op = now(),
        actief_vanaf = case
          when p_status in ('actief', 'test') and actief_vanaf is null
            then (timezone('Europe/Amsterdam', now()))::date
          else actief_vanaf
        end
    where sleutel = p_sleutel;
  insert into public.automatisering_audit (automatisering_sleutel, oude_status, nieuwe_status, gebruiker)
  values (p_sleutel, oud, p_status, p_gebruiker);
end;
$$;

revoke all on function public.zet_automatisering_status(text, text, text) from public, anon, authenticated;
grant execute on function public.zet_automatisering_status(text, text, text) to service_role;

create or replace function public.bewaak_testmailadres()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_tekst text;
begin
  if new.sleutel is distinct from 'testmailadres' then
    return new;
  end if;
  if current_user not in ('service_role', 'postgres', 'supabase_admin') and not app.is_super_admin() then
    raise exception 'Alleen een super admin mag het testmailadres wijzigen.';
  end if;
  v_tekst := btrim(coalesce(new.waarde #>> '{}', ''));
  if v_tekst = ''
    or position(',' in v_tekst) > 0
    or position(';' in v_tekst) > 0
    or v_tekst ~ '[[:space:]]'
    or v_tekst !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    raise exception 'Ongeldig testmailadres.';
  end if;
  return new;
end;
$$;

drop trigger if exists bewaak_testmailadres on public.instellingen;
create trigger bewaak_testmailadres
  before insert or update on public.instellingen
  for each row
  execute function public.bewaak_testmailadres();

drop policy if exists jobs_insert_aanvraag on public.communicatie_jobs;
create policy jobs_insert_aanvraag on public.communicatie_jobs
  for insert to authenticated
  with check ((select app.heeft_recht('aanvragen', 'schrijven')));

drop policy if exists jobs_select_dossier on public.communicatie_jobs;
create policy jobs_select_dossier on public.communicatie_jobs
  for select to authenticated
  using (
    (select app.heeft_recht('aanvragen', 'lezen'))
    or (select app.heeft_recht('relaties', 'lezen'))
  );

drop policy if exists verzendingen_insert_aanvraag on public.communicatie_verzendingen;
create policy verzendingen_insert_aanvraag on public.communicatie_verzendingen
  for insert to authenticated
  with check (
    (select app.heeft_recht('aanvragen', 'schrijven'))
    or (select app.heeft_recht('boekingen', 'schrijven'))
  );

drop policy if exists verzendingen_select_dossier on public.communicatie_verzendingen;
create policy verzendingen_select_dossier on public.communicatie_verzendingen
  for select to authenticated
  using (
    (select app.heeft_recht('aanvragen', 'lezen'))
    or (select app.heeft_recht('relaties', 'lezen'))
    or (select app.heeft_recht('boekingen', 'lezen'))
  );

-- Privé-intake. public-media blijft de openbare publicatiebucket en wordt hier niet gewijzigd.
create table if not exists public.content_intake_bestanden (
  id bigint generated always as identity primary key,
  boeking_id bigint not null references public.boekingen (id) on delete cascade,
  rol text not null check (rol in ('hoofd', 'extra')),
  storage_pad text not null unique,
  mime_type text not null,
  bytes integer not null,
  aangemaakt_op timestamptz not null default now()
);

alter table public.content_intake_bestanden enable row level security;
revoke all on table public.content_intake_bestanden from anon;
grant select on table public.content_intake_bestanden to authenticated;

drop policy if exists content_intake_lezen on public.content_intake_bestanden;
create policy content_intake_lezen on public.content_intake_bestanden
  for select to authenticated
  using (
    (select app.heeft_recht('boekingen', 'lezen'))
    or (select app.heeft_recht('agenda', 'lezen'))
  );

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'content-intake',
      'content-intake',
      false,
      8000000,
      array['image/jpeg', 'image/png', 'image/webp']::text[]
    )
    on conflict (id) do nothing;

    drop policy if exists content_intake_storage_lezen on storage.objects;
    create policy content_intake_storage_lezen on storage.objects
      for select to authenticated
      using (
        bucket_id = 'content-intake'
        and (
          (select app.heeft_recht('boekingen', 'lezen'))
          or (select app.heeft_recht('agenda', 'lezen'))
        )
      );
  end if;
end $$;
