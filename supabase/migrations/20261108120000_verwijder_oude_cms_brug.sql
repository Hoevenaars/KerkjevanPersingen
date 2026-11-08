-- De oude contentbrug is leeg en wordt niet meer aangeroepen.
-- Boekingen, betalingen, activiteiten en relaties blijven staan.
-- importpayload bewaart dezelfde jsonb die eerder raw_sanity heette.

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
  where a.start_datum is not null
    and a.eind_datum is not null
    and (
      (
        a.zichtbaarheid = 'bezet'
        and not (coalesce(a.lokale_override, '{}'::jsonb) ? 'annulering')
      )
      or (
        a.zichtbaarheid = 'publiek'
        and coalesce(a.levenscyclus, 'actief') <> 'geannuleerd'
      )
    )
    and not exists (
      select 1 from public.boekingen b
      where b.status in ('optie', 'definitief', 'migratie_vastgelegd', 'optie_verlopen')
        and b.start_datum <= a.eind_datum
        and b.eind_datum >= a.start_datum
    )
$$;

revoke all on function public.publieke_bezetting() from public;
grant execute on function public.publieke_bezetting() to anon, authenticated, service_role;

drop function if exists public.pas_sanity_bridge(jsonb, jsonb);
drop function if exists public.importeer_sanity_batch(jsonb);

drop table if exists public.sanity_bridge_agenda;
drop table if exists public.bridge_sync_log;

do $$
declare
  rij record;
begin
  for rij in
    select table_schema, table_name
    from information_schema.columns
    where table_schema = 'public'
      and column_name = 'raw_sanity'
  loop
    execute format(
      'alter table %I.%I rename column raw_sanity to importpayload',
      rij.table_schema,
      rij.table_name
    );
  end loop;
end $$;

update public.bronnen
set schrijvende_bron = 'beheer',
    toelichting = 'Supabase'
where schrijvende_bron::text = 'sanity';

alter table public.bronnen alter column schrijvende_bron drop default;
alter table public.bronnen alter column schrijvende_bron type text using schrijvende_bron::text;
drop type public.schrijvende_bron;
create type public.schrijvende_bron as enum ('beheer');
alter table public.bronnen
  alter column schrijvende_bron type public.schrijvende_bron
  using schrijvende_bron::public.schrijvende_bron;
alter table public.bronnen alter column schrijvende_bron set default 'beheer';

alter table public.activiteit_bron alter column legacy_source set default 'import';
alter table public.mediabestanden alter column legacy_source set default 'import';
