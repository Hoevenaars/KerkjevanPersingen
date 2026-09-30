-- Fase 5B: zichtbaarheid van Sanity-activiteiten en inventaris van ongekoppelde beelden.
-- Bestaande relaties, boekingen, betalingen en gastbegeleiders blijven onaangeroerd.
-- Geen mail, geen communicatiejob, geen token.

alter table public.publieke_activiteiten
  add column if not exists zichtbaarheid text;

alter table public.publieke_activiteiten
  drop constraint if exists publieke_activiteiten_zichtbaarheid_check;
alter table public.publieke_activiteiten
  add constraint publieke_activiteiten_zichtbaarheid_check
  check (zichtbaarheid is null or zichtbaarheid in ('publiek', 'bezet', 'verborgen'));

create table if not exists public.activiteit_bron (
  id bigint generated always as identity primary key,
  legacy_source text not null default 'sanity',
  legacy_id text not null,
  zichtbaarheid text not null check (zichtbaarheid in ('publiek', 'bezet', 'verborgen')),
  soort text,
  titel text,
  interne_titel text,
  slug text,
  start_datum date,
  eind_datum date,
  publicatie_trigger public.publicatie_trigger,
  content_status text,
  op_publieke_agenda boolean not null default false,
  raw_sanity jsonb,
  unique (legacy_source, legacy_id)
);

create table if not exists public.mediabestanden (
  id bigint generated always as identity primary key,
  legacy_source text not null default 'sanity',
  legacy_id text not null,
  bestandsnaam text,
  mime_type text,
  bytes integer,
  bron_url text,
  gekoppeld_aan text,
  runtime_gebruikt boolean not null default false,
  doel_bucket text,
  nieuwe_url text,
  zichtbaarheid text not null default 'niet_gebruikt',
  migratiestatus text not null,
  unique (legacy_source, legacy_id)
);

alter table public.activiteit_bron enable row level security;
alter table public.mediabestanden enable row level security;
revoke all on table public.activiteit_bron from anon, authenticated;
revoke all on table public.mediabestanden from anon, authenticated;

insert into public.activiteit_bron (
  legacy_source, legacy_id, zichtbaarheid, soort, titel, interne_titel, slug,
  start_datum, eind_datum, publicatie_trigger, content_status, op_publieke_agenda, raw_sanity
) values (
  'sanity', '0dd6cb19-b439-40bd-a6c9-520a63b6e1d2', 'bezet', 'expositie', 'Expositie: Anne Sey', 'Expositie: Anne Sey', null,
  '2028-07-15'::date, '2028-07-16'::date, null, null, false, '{"_id": "0dd6cb19-b439-40bd-a6c9-520a63b6e1d2", "zichtbaarheid": "bezet", "soort": "expositie", "start": "2028-07-15T09:00:00.000Z", "eind": "2028-07-16T16:00:00.000Z", "publiekeTitel": null, "interneTitel": "Expositie: Anne Sey", "slug": null, "contentStatus": null, "toonVanafMaanden": null}'::jsonb
) on conflict (legacy_source, legacy_id) do update set
  zichtbaarheid = excluded.zichtbaarheid,
  soort = excluded.soort,
  titel = excluded.titel,
  interne_titel = excluded.interne_titel,
  slug = excluded.slug,
  start_datum = excluded.start_datum,
  eind_datum = excluded.eind_datum,
  publicatie_trigger = excluded.publicatie_trigger,
  content_status = excluded.content_status,
  op_publieke_agenda = excluded.op_publieke_agenda,
  raw_sanity = excluded.raw_sanity;

insert into public.activiteit_bron (
  legacy_source, legacy_id, zichtbaarheid, soort, titel, interne_titel, slug,
  start_datum, eind_datum, publicatie_trigger, content_status, op_publieke_agenda, raw_sanity
) values (
  'sanity', '3b8ff68b-8110-46bf-af5e-cf119d3cd50d', 'bezet', 'bruiloft', 'Roos Hilstra - huwelijk (optie)', 'Roos Hilstra - huwelijk (optie)', null,
  '2027-06-25'::date, '2027-06-25'::date, null, null, false, '{"_id": "3b8ff68b-8110-46bf-af5e-cf119d3cd50d", "zichtbaarheid": "bezet", "soort": "bruiloft", "start": "2027-06-25T08:00:00.000Z", "eind": "2027-06-25T20:00:00.000Z", "publiekeTitel": null, "interneTitel": "Roos Hilstra - huwelijk (optie)", "slug": null, "contentStatus": null, "toonVanafMaanden": null}'::jsonb
) on conflict (legacy_source, legacy_id) do update set
  zichtbaarheid = excluded.zichtbaarheid,
  soort = excluded.soort,
  titel = excluded.titel,
  interne_titel = excluded.interne_titel,
  slug = excluded.slug,
  start_datum = excluded.start_datum,
  eind_datum = excluded.eind_datum,
  publicatie_trigger = excluded.publicatie_trigger,
  content_status = excluded.content_status,
  op_publieke_agenda = excluded.op_publieke_agenda,
  raw_sanity = excluded.raw_sanity;

insert into public.activiteit_bron (
  legacy_source, legacy_id, zichtbaarheid, soort, titel, interne_titel, slug,
  start_datum, eind_datum, publicatie_trigger, content_status, op_publieke_agenda, raw_sanity
) values (
  'sanity', '50d5d541-28fb-4859-9c75-932a286471c6', 'bezet', 'expositie', 'Expositie: Amke Postma', 'Expositie: Amke Postma', null,
  '2028-04-08'::date, '2028-04-09'::date, null, null, false, '{"_id": "50d5d541-28fb-4859-9c75-932a286471c6", "zichtbaarheid": "bezet", "soort": "expositie", "start": "2028-04-08T09:00:00.000Z", "eind": "2028-04-09T16:00:00.000Z", "publiekeTitel": null, "interneTitel": "Expositie: Amke Postma", "slug": null, "contentStatus": null, "toonVanafMaanden": null}'::jsonb
) on conflict (legacy_source, legacy_id) do update set
  zichtbaarheid = excluded.zichtbaarheid,
  soort = excluded.soort,
  titel = excluded.titel,
  interne_titel = excluded.interne_titel,
  slug = excluded.slug,
  start_datum = excluded.start_datum,
  eind_datum = excluded.eind_datum,
  publicatie_trigger = excluded.publicatie_trigger,
  content_status = excluded.content_status,
  op_publieke_agenda = excluded.op_publieke_agenda,
  raw_sanity = excluded.raw_sanity;

insert into public.activiteit_bron (
  legacy_source, legacy_id, zichtbaarheid, soort, titel, interne_titel, slug,
  start_datum, eind_datum, publicatie_trigger, content_status, op_publieke_agenda, raw_sanity
) values (
  'sanity', '70f30efa-c667-4b52-8a22-7a01012a39c7', 'bezet', 'expositie', 'Expositie: Martine van Zwieten', 'Expositie: Martine van Zwieten', null,
  '2028-02-26'::date, '2028-02-27'::date, null, null, false, '{"_id": "70f30efa-c667-4b52-8a22-7a01012a39c7", "zichtbaarheid": "bezet", "soort": "expositie", "start": "2028-02-26T10:00:00.000Z", "eind": "2028-02-27T17:00:00.000Z", "publiekeTitel": null, "interneTitel": "Expositie: Martine van Zwieten", "slug": null, "contentStatus": null, "toonVanafMaanden": null}'::jsonb
) on conflict (legacy_source, legacy_id) do update set
  zichtbaarheid = excluded.zichtbaarheid,
  soort = excluded.soort,
  titel = excluded.titel,
  interne_titel = excluded.interne_titel,
  slug = excluded.slug,
  start_datum = excluded.start_datum,
  eind_datum = excluded.eind_datum,
  publicatie_trigger = excluded.publicatie_trigger,
  content_status = excluded.content_status,
  op_publieke_agenda = excluded.op_publieke_agenda,
  raw_sanity = excluded.raw_sanity;

insert into public.activiteit_bron (
  legacy_source, legacy_id, zichtbaarheid, soort, titel, interne_titel, slug,
  start_datum, eind_datum, publicatie_trigger, content_status, op_publieke_agenda, raw_sanity
) values (
  'sanity', '924d9c9e-6c99-4827-85ae-dc7623f2f5a6', 'publiek', 'expositie', 'Expositie Josee Wuyts', 'Expositie Josee Wuyts', null,
  '2028-08-19'::date, '2028-08-20'::date, 'uiterlijk_12_maanden'::public.publicatie_trigger, null, true, '{"_id": "924d9c9e-6c99-4827-85ae-dc7623f2f5a6", "zichtbaarheid": "publiek", "soort": "expositie", "start": "2028-08-19T21:47:00.000Z", "eind": "2028-08-20T21:47:00.000Z", "publiekeTitel": "Expositie Josee Wuyts", "interneTitel": "Expositie Josee Wuyts", "slug": null, "contentStatus": null, "toonVanafMaanden": "12"}'::jsonb
) on conflict (legacy_source, legacy_id) do update set
  zichtbaarheid = excluded.zichtbaarheid,
  soort = excluded.soort,
  titel = excluded.titel,
  interne_titel = excluded.interne_titel,
  slug = excluded.slug,
  start_datum = excluded.start_datum,
  eind_datum = excluded.eind_datum,
  publicatie_trigger = excluded.publicatie_trigger,
  content_status = excluded.content_status,
  op_publieke_agenda = excluded.op_publieke_agenda,
  raw_sanity = excluded.raw_sanity;

insert into public.activiteit_bron (
  legacy_source, legacy_id, zichtbaarheid, soort, titel, interne_titel, slug,
  start_datum, eind_datum, publicatie_trigger, content_status, op_publieke_agenda, raw_sanity
) values (
  'sanity', '9cef6dd9-b0db-4930-beb2-839e1c52272e', 'publiek', 'expositie', 'Expositie Anja Peters icm Lisa Peters', 'Anja Peters', 'expositie-anja-peters-icm-lisa-peters',
  '2028-08-26'::date, '2028-08-27'::date, 'uiterlijk_12_maanden'::public.publicatie_trigger, null, true, '{"_id": "9cef6dd9-b0db-4930-beb2-839e1c52272e", "zichtbaarheid": "publiek", "soort": "expositie", "start": "2028-08-26T18:52:00.000Z", "eind": "2028-08-27T18:52:00.000Z", "publiekeTitel": "Expositie Anja Peters icm Lisa Peters", "interneTitel": "Anja Peters", "slug": "expositie-anja-peters-icm-lisa-peters", "contentStatus": null, "toonVanafMaanden": "12"}'::jsonb
) on conflict (legacy_source, legacy_id) do update set
  zichtbaarheid = excluded.zichtbaarheid,
  soort = excluded.soort,
  titel = excluded.titel,
  interne_titel = excluded.interne_titel,
  slug = excluded.slug,
  start_datum = excluded.start_datum,
  eind_datum = excluded.eind_datum,
  publicatie_trigger = excluded.publicatie_trigger,
  content_status = excluded.content_status,
  op_publieke_agenda = excluded.op_publieke_agenda,
  raw_sanity = excluded.raw_sanity;

insert into public.activiteit_bron (
  legacy_source, legacy_id, zichtbaarheid, soort, titel, interne_titel, slug,
  start_datum, eind_datum, publicatie_trigger, content_status, op_publieke_agenda, raw_sanity
) values (
  'sanity', 'EL8QbLNEvjfBr31EiB7Hu9', 'publiek', 'expositie', 'Expositie Isabelle Hartman', 'Expositie Isabelle Hartman', 'expositie-isabelle-hartman',
  '2028-02-19'::date, '2028-02-20'::date, 'uiterlijk_3_maanden'::public.publicatie_trigger, 'ontbreekt', true, '{"_id": "EL8QbLNEvjfBr31EiB7Hu9", "zichtbaarheid": "publiek", "soort": "expositie", "start": "2028-02-19T09:00:00.000Z", "eind": "2028-02-20T16:00:00.000Z", "publiekeTitel": "Expositie Isabelle Hartman", "interneTitel": "Expositie Isabelle Hartman", "slug": "expositie-isabelle-hartman", "contentStatus": "ontbreekt", "toonVanafMaanden": "3"}'::jsonb
) on conflict (legacy_source, legacy_id) do update set
  zichtbaarheid = excluded.zichtbaarheid,
  soort = excluded.soort,
  titel = excluded.titel,
  interne_titel = excluded.interne_titel,
  slug = excluded.slug,
  start_datum = excluded.start_datum,
  eind_datum = excluded.eind_datum,
  publicatie_trigger = excluded.publicatie_trigger,
  content_status = excluded.content_status,
  op_publieke_agenda = excluded.op_publieke_agenda,
  raw_sanity = excluded.raw_sanity;

insert into public.activiteit_bron (
  legacy_source, legacy_id, zichtbaarheid, soort, titel, interne_titel, slug,
  start_datum, eind_datum, publicatie_trigger, content_status, op_publieke_agenda, raw_sanity
) values (
  'sanity', 'EsszLtEmz7EWEiuVA3JhIZ', 'verborgen', 'expositie', 'Expositie: Rein van vucht', 'Expositie: Rein van vucht', null,
  '2029-08-25'::date, '2029-08-26'::date, null, 'ontbreekt', false, '{"_id": "EsszLtEmz7EWEiuVA3JhIZ", "zichtbaarheid": "verborgen", "soort": "expositie", "start": "2029-08-25T09:00:00.000Z", "eind": "2029-08-26T16:00:00.000Z", "publiekeTitel": null, "interneTitel": "Expositie: Rein van vucht", "slug": null, "contentStatus": "ontbreekt", "toonVanafMaanden": null}'::jsonb
) on conflict (legacy_source, legacy_id) do update set
  zichtbaarheid = excluded.zichtbaarheid,
  soort = excluded.soort,
  titel = excluded.titel,
  interne_titel = excluded.interne_titel,
  slug = excluded.slug,
  start_datum = excluded.start_datum,
  eind_datum = excluded.eind_datum,
  publicatie_trigger = excluded.publicatie_trigger,
  content_status = excluded.content_status,
  op_publieke_agenda = excluded.op_publieke_agenda,
  raw_sanity = excluded.raw_sanity;

insert into public.activiteit_bron (
  legacy_source, legacy_id, zichtbaarheid, soort, titel, interne_titel, slug,
  start_datum, eind_datum, publicatie_trigger, content_status, op_publieke_agenda, raw_sanity
) values (
  'sanity', 'Mu4mmusnTi1oljyWMmaEB4', 'verborgen', 'concert', 'Concert: Lian van den Berg', 'Concert: Lian van den Berg', null,
  '2026-12-11'::date, '2026-12-11'::date, null, 'ontbreekt', false, '{"_id": "Mu4mmusnTi1oljyWMmaEB4", "zichtbaarheid": "verborgen", "soort": "concert", "start": "2026-12-11T09:00:00.000Z", "eind": "2026-12-11T16:00:00.000Z", "publiekeTitel": null, "interneTitel": "Concert: Lian van den Berg", "slug": null, "contentStatus": "ontbreekt", "toonVanafMaanden": null}'::jsonb
) on conflict (legacy_source, legacy_id) do update set
  zichtbaarheid = excluded.zichtbaarheid,
  soort = excluded.soort,
  titel = excluded.titel,
  interne_titel = excluded.interne_titel,
  slug = excluded.slug,
  start_datum = excluded.start_datum,
  eind_datum = excluded.eind_datum,
  publicatie_trigger = excluded.publicatie_trigger,
  content_status = excluded.content_status,
  op_publieke_agenda = excluded.op_publieke_agenda,
  raw_sanity = excluded.raw_sanity;

insert into public.activiteit_bron (
  legacy_source, legacy_id, zichtbaarheid, soort, titel, interne_titel, slug,
  start_datum, eind_datum, publicatie_trigger, content_status, op_publieke_agenda, raw_sanity
) values (
  'sanity', 'OtQAgcGKVHGif6gubZXOVQ', 'verborgen', 'diverse', 'Diverse bijeenkomsten: Jona Mars', 'Diverse bijeenkomsten: Jona Mars', null,
  '2026-10-09'::date, '2026-10-09'::date, null, 'ontbreekt', false, '{"_id": "OtQAgcGKVHGif6gubZXOVQ", "zichtbaarheid": "verborgen", "soort": "diverse", "start": "2026-10-09T09:00:00.000Z", "eind": "2026-10-09T16:00:00.000Z", "publiekeTitel": null, "interneTitel": "Diverse bijeenkomsten: Jona Mars", "slug": null, "contentStatus": "ontbreekt", "toonVanafMaanden": null}'::jsonb
) on conflict (legacy_source, legacy_id) do update set
  zichtbaarheid = excluded.zichtbaarheid,
  soort = excluded.soort,
  titel = excluded.titel,
  interne_titel = excluded.interne_titel,
  slug = excluded.slug,
  start_datum = excluded.start_datum,
  eind_datum = excluded.eind_datum,
  publicatie_trigger = excluded.publicatie_trigger,
  content_status = excluded.content_status,
  op_publieke_agenda = excluded.op_publieke_agenda,
  raw_sanity = excluded.raw_sanity;

insert into public.activiteit_bron (
  legacy_source, legacy_id, zichtbaarheid, soort, titel, interne_titel, slug,
  start_datum, eind_datum, publicatie_trigger, content_status, op_publieke_agenda, raw_sanity
) values (
  'sanity', 'OtQAgcGKVHGif6gubZY0hA', 'verborgen', 'diverse', 'Diverse bijeenkomsten: Jona Mars', 'Diverse bijeenkomsten: Jona Mars', null,
  '2026-09-10'::date, '2026-09-10'::date, null, 'ontbreekt', false, '{"_id": "OtQAgcGKVHGif6gubZY0hA", "zichtbaarheid": "verborgen", "soort": "diverse", "start": "2026-09-10T09:00:00.000Z", "eind": "2026-09-10T16:00:00.000Z", "publiekeTitel": null, "interneTitel": "Diverse bijeenkomsten: Jona Mars", "slug": null, "contentStatus": "ontbreekt", "toonVanafMaanden": null}'::jsonb
) on conflict (legacy_source, legacy_id) do update set
  zichtbaarheid = excluded.zichtbaarheid,
  soort = excluded.soort,
  titel = excluded.titel,
  interne_titel = excluded.interne_titel,
  slug = excluded.slug,
  start_datum = excluded.start_datum,
  eind_datum = excluded.eind_datum,
  publicatie_trigger = excluded.publicatie_trigger,
  content_status = excluded.content_status,
  op_publieke_agenda = excluded.op_publieke_agenda,
  raw_sanity = excluded.raw_sanity;

insert into public.activiteit_bron (
  legacy_source, legacy_id, zichtbaarheid, soort, titel, interne_titel, slug,
  start_datum, eind_datum, publicatie_trigger, content_status, op_publieke_agenda, raw_sanity
) values (
  'sanity', 'PoKSgQqVmCxvFLnsd5p5gs', 'verborgen', 'diverse', 'Diverse bijeenkomsten: Riche Hendriks', 'Diverse bijeenkomsten: Riche Hendriks', null,
  '2027-03-05'::date, '2027-03-05'::date, null, 'ontbreekt', false, '{"_id": "PoKSgQqVmCxvFLnsd5p5gs", "zichtbaarheid": "verborgen", "soort": "diverse", "start": "2027-03-05T09:00:00.000Z", "eind": "2027-03-05T16:00:00.000Z", "publiekeTitel": null, "interneTitel": "Diverse bijeenkomsten: Riche Hendriks", "slug": null, "contentStatus": "ontbreekt", "toonVanafMaanden": null}'::jsonb
) on conflict (legacy_source, legacy_id) do update set
  zichtbaarheid = excluded.zichtbaarheid,
  soort = excluded.soort,
  titel = excluded.titel,
  interne_titel = excluded.interne_titel,
  slug = excluded.slug,
  start_datum = excluded.start_datum,
  eind_datum = excluded.eind_datum,
  publicatie_trigger = excluded.publicatie_trigger,
  content_status = excluded.content_status,
  op_publieke_agenda = excluded.op_publieke_agenda,
  raw_sanity = excluded.raw_sanity;

insert into public.activiteit_bron (
  legacy_source, legacy_id, zichtbaarheid, soort, titel, interne_titel, slug,
  start_datum, eind_datum, publicatie_trigger, content_status, op_publieke_agenda, raw_sanity
) values (
  'sanity', 'ab9411f9-9da4-454b-afda-8816a8d1798d', 'publiek', 'expositie', 'Expositie Leon Swinkels icm J. Haverkate, F. Timmermans, R. Hendriks, J. van Swelm', 'Leon Swinkels', 'expositie-leon-swinkels-icm-j-haverkate-f-timmermans-r-hendriks-j-van-swelm',
  '2028-03-11'::date, '2028-03-12'::date, 'uiterlijk_12_maanden'::public.publicatie_trigger, null, true, '{"_id": "ab9411f9-9da4-454b-afda-8816a8d1798d", "zichtbaarheid": "publiek", "soort": "expositie", "start": "2028-03-11T19:48:00.000Z", "eind": "2028-03-12T19:48:00.000Z", "publiekeTitel": "Expositie Leon Swinkels icm J. Haverkate, F. Timmermans, R. Hendriks, J. van Swelm", "interneTitel": "Leon Swinkels", "slug": "expositie-leon-swinkels-icm-j-haverkate-f-timmermans-r-hendriks-j-van-swelm", "contentStatus": null, "toonVanafMaanden": "12"}'::jsonb
) on conflict (legacy_source, legacy_id) do update set
  zichtbaarheid = excluded.zichtbaarheid,
  soort = excluded.soort,
  titel = excluded.titel,
  interne_titel = excluded.interne_titel,
  slug = excluded.slug,
  start_datum = excluded.start_datum,
  eind_datum = excluded.eind_datum,
  publicatie_trigger = excluded.publicatie_trigger,
  content_status = excluded.content_status,
  op_publieke_agenda = excluded.op_publieke_agenda,
  raw_sanity = excluded.raw_sanity;

insert into public.activiteit_bron (
  legacy_source, legacy_id, zichtbaarheid, soort, titel, interne_titel, slug,
  start_datum, eind_datum, publicatie_trigger, content_status, op_publieke_agenda, raw_sanity
) values (
  'sanity', 'd3a36ad1-d16c-492b-a11a-04f3d644e925', 'bezet', 'expositie', 'Expositie: Nelian Smit / Winy Smit Vuijk', 'Expositie: Nelian Smit / Winy Smit Vuijk', null,
  '2027-06-26'::date, '2027-06-27'::date, null, null, false, '{"_id": "d3a36ad1-d16c-492b-a11a-04f3d644e925", "zichtbaarheid": "bezet", "soort": "expositie", "start": "2027-06-26T09:00:00.000Z", "eind": "2027-06-27T16:00:00.000Z", "publiekeTitel": null, "interneTitel": "Expositie: Nelian Smit / Winy Smit Vuijk", "slug": null, "contentStatus": null, "toonVanafMaanden": null}'::jsonb
) on conflict (legacy_source, legacy_id) do update set
  zichtbaarheid = excluded.zichtbaarheid,
  soort = excluded.soort,
  titel = excluded.titel,
  interne_titel = excluded.interne_titel,
  slug = excluded.slug,
  start_datum = excluded.start_datum,
  eind_datum = excluded.eind_datum,
  publicatie_trigger = excluded.publicatie_trigger,
  content_status = excluded.content_status,
  op_publieke_agenda = excluded.op_publieke_agenda,
  raw_sanity = excluded.raw_sanity;

insert into public.activiteit_bron (
  legacy_source, legacy_id, zichtbaarheid, soort, titel, interne_titel, slug,
  start_datum, eind_datum, publicatie_trigger, content_status, op_publieke_agenda, raw_sanity
) values (
  'sanity', 'e3e063c0-3069-482d-874d-023c92cbb45f', 'publiek', 'expositie', 'Expositie Trinette Korver', 'Trinette Korver', 'expositie-trinette-korver',
  '2028-07-29'::date, '2028-07-30'::date, 'uiterlijk_12_maanden'::public.publicatie_trigger, null, true, '{"_id": "e3e063c0-3069-482d-874d-023c92cbb45f", "zichtbaarheid": "publiek", "soort": "expositie", "start": "2028-07-29T18:50:00.000Z", "eind": "2028-07-30T18:50:00.000Z", "publiekeTitel": "Expositie Trinette Korver", "interneTitel": "Trinette Korver", "slug": "expositie-trinette-korver", "contentStatus": null, "toonVanafMaanden": "12"}'::jsonb
) on conflict (legacy_source, legacy_id) do update set
  zichtbaarheid = excluded.zichtbaarheid,
  soort = excluded.soort,
  titel = excluded.titel,
  interne_titel = excluded.interne_titel,
  slug = excluded.slug,
  start_datum = excluded.start_datum,
  eind_datum = excluded.eind_datum,
  publicatie_trigger = excluded.publicatie_trigger,
  content_status = excluded.content_status,
  op_publieke_agenda = excluded.op_publieke_agenda,
  raw_sanity = excluded.raw_sanity;

insert into public.activiteit_bron (
  legacy_source, legacy_id, zichtbaarheid, soort, titel, interne_titel, slug,
  start_datum, eind_datum, publicatie_trigger, content_status, op_publieke_agenda, raw_sanity
) values (
  'sanity', 'e5b8622b-794e-4be1-a9eb-6c99f293808d', 'publiek', 'expositie', 'Expositie Isabelle Hartman', 'Isabelle Hartman', null,
  '2027-07-31'::date, '2027-08-01'::date, 'uiterlijk_3_maanden'::public.publicatie_trigger, null, true, '{"_id": "e5b8622b-794e-4be1-a9eb-6c99f293808d", "zichtbaarheid": "publiek", "soort": "expositie", "start": "2027-07-31T21:52:00.000Z", "eind": "2027-08-01T21:52:00.000Z", "publiekeTitel": "Expositie Isabelle Hartman", "interneTitel": "Isabelle Hartman", "slug": null, "contentStatus": null, "toonVanafMaanden": "3"}'::jsonb
) on conflict (legacy_source, legacy_id) do update set
  zichtbaarheid = excluded.zichtbaarheid,
  soort = excluded.soort,
  titel = excluded.titel,
  interne_titel = excluded.interne_titel,
  slug = excluded.slug,
  start_datum = excluded.start_datum,
  eind_datum = excluded.eind_datum,
  publicatie_trigger = excluded.publicatie_trigger,
  content_status = excluded.content_status,
  op_publieke_agenda = excluded.op_publieke_agenda,
  raw_sanity = excluded.raw_sanity;

insert into public.activiteit_bron (
  legacy_source, legacy_id, zichtbaarheid, soort, titel, interne_titel, slug,
  start_datum, eind_datum, publicatie_trigger, content_status, op_publieke_agenda, raw_sanity
) values (
  'sanity', 'fFiCk4kfAxfq0oYmuRYAgN', 'verborgen', 'expositie', 'expositie Evelien Bannenberg 2 dimensionale kunst', 'Expositie: Evelien Bannenberg', null,
  '2026-11-07'::date, '2026-11-08'::date, null, 'ontbreekt', false, '{"_id": "fFiCk4kfAxfq0oYmuRYAgN", "zichtbaarheid": "verborgen", "soort": "expositie", "start": "2026-11-07T09:00:00.000Z", "eind": "2026-11-08T16:00:00.000Z", "publiekeTitel": "expositie Evelien Bannenberg 2 dimensionale kunst", "interneTitel": "Expositie: Evelien Bannenberg", "slug": null, "contentStatus": "ontbreekt", "toonVanafMaanden": null}'::jsonb
) on conflict (legacy_source, legacy_id) do update set
  zichtbaarheid = excluded.zichtbaarheid,
  soort = excluded.soort,
  titel = excluded.titel,
  interne_titel = excluded.interne_titel,
  slug = excluded.slug,
  start_datum = excluded.start_datum,
  eind_datum = excluded.eind_datum,
  publicatie_trigger = excluded.publicatie_trigger,
  content_status = excluded.content_status,
  op_publieke_agenda = excluded.op_publieke_agenda,
  raw_sanity = excluded.raw_sanity;

insert into public.activiteit_bron (
  legacy_source, legacy_id, zichtbaarheid, soort, titel, interne_titel, slug,
  start_datum, eind_datum, publicatie_trigger, content_status, op_publieke_agenda, raw_sanity
) values (
  'sanity', 'sCZcoCo5kqvXGbG6ZnaCTh', 'verborgen', 'expositie', 'Expositie Tiny Zijlstra in combinatie met Doreen Bour', 'Expositie: Tiny Zijlstra', null,
  '2028-09-30'::date, '2028-10-01'::date, null, 'ontbreekt', false, '{"_id": "sCZcoCo5kqvXGbG6ZnaCTh", "zichtbaarheid": "verborgen", "soort": "expositie", "start": "2028-09-30T09:00:00.000Z", "eind": "2028-10-01T16:00:00.000Z", "publiekeTitel": "Expositie Tiny Zijlstra in combinatie met Doreen Bour", "interneTitel": "Expositie: Tiny Zijlstra", "slug": null, "contentStatus": "ontbreekt", "toonVanafMaanden": null}'::jsonb
) on conflict (legacy_source, legacy_id) do update set
  zichtbaarheid = excluded.zichtbaarheid,
  soort = excluded.soort,
  titel = excluded.titel,
  interne_titel = excluded.interne_titel,
  slug = excluded.slug,
  start_datum = excluded.start_datum,
  eind_datum = excluded.eind_datum,
  publicatie_trigger = excluded.publicatie_trigger,
  content_status = excluded.content_status,
  op_publieke_agenda = excluded.op_publieke_agenda,
  raw_sanity = excluded.raw_sanity;

insert into public.activiteit_bron (
  legacy_source, legacy_id, zichtbaarheid, soort, titel, interne_titel, slug,
  start_datum, eind_datum, publicatie_trigger, content_status, op_publieke_agenda, raw_sanity
) values (
  'sanity', 'sNdnHqWHhT1X1YN0TvomGe', 'verborgen', 'diverse', 'Diverse bijeenkomsten: Floor Remmelzwaal', 'Diverse bijeenkomsten: Floor Remmelzwaal', null,
  '2028-03-06'::date, '2028-03-07'::date, null, 'ontbreekt', false, '{"_id": "sNdnHqWHhT1X1YN0TvomGe", "zichtbaarheid": "verborgen", "soort": "diverse", "start": "2028-03-06T09:00:00.000Z", "eind": "2028-03-07T16:00:00.000Z", "publiekeTitel": null, "interneTitel": "Diverse bijeenkomsten: Floor Remmelzwaal", "slug": null, "contentStatus": "ontbreekt", "toonVanafMaanden": null}'::jsonb
) on conflict (legacy_source, legacy_id) do update set
  zichtbaarheid = excluded.zichtbaarheid,
  soort = excluded.soort,
  titel = excluded.titel,
  interne_titel = excluded.interne_titel,
  slug = excluded.slug,
  start_datum = excluded.start_datum,
  eind_datum = excluded.eind_datum,
  publicatie_trigger = excluded.publicatie_trigger,
  content_status = excluded.content_status,
  op_publieke_agenda = excluded.op_publieke_agenda,
  raw_sanity = excluded.raw_sanity;

insert into public.activiteit_bron (
  legacy_source, legacy_id, zichtbaarheid, soort, titel, interne_titel, slug,
  start_datum, eind_datum, publicatie_trigger, content_status, op_publieke_agenda, raw_sanity
) values (
  'sanity', 'tJLVdtv3P0oH7KV76SBzP5', 'bezet', 'expositie', 'Expositie Karen Brouwer', 'Expositie: Karen Brouwer', null,
  '2028-08-12'::date, '2028-08-13'::date, null, 'ontbreekt', false, '{"_id": "tJLVdtv3P0oH7KV76SBzP5", "zichtbaarheid": "bezet", "soort": "expositie", "start": "2028-08-12T09:00:00.000Z", "eind": "2028-08-13T15:00:00.000Z", "publiekeTitel": "Expositie Karen Brouwer", "interneTitel": "Expositie: Karen Brouwer", "slug": null, "contentStatus": "ontbreekt", "toonVanafMaanden": null}'::jsonb
) on conflict (legacy_source, legacy_id) do update set
  zichtbaarheid = excluded.zichtbaarheid,
  soort = excluded.soort,
  titel = excluded.titel,
  interne_titel = excluded.interne_titel,
  slug = excluded.slug,
  start_datum = excluded.start_datum,
  eind_datum = excluded.eind_datum,
  publicatie_trigger = excluded.publicatie_trigger,
  content_status = excluded.content_status,
  op_publieke_agenda = excluded.op_publieke_agenda,
  raw_sanity = excluded.raw_sanity;

insert into public.activiteit_bron (
  legacy_source, legacy_id, zichtbaarheid, soort, titel, interne_titel, slug,
  start_datum, eind_datum, publicatie_trigger, content_status, op_publieke_agenda, raw_sanity
) values (
  'sanity', 'tK6YSvZ1UTtMScmpBoQ6pf', 'verborgen', 'expositie', 'Expositie: Test Nick Hoevenaars', 'Expositie: Test Nick Hoevenaars', null,
  '2026-11-07'::date, '2026-11-08'::date, null, 'ontbreekt', false, '{"_id": "tK6YSvZ1UTtMScmpBoQ6pf", "zichtbaarheid": "verborgen", "soort": "expositie", "start": "2026-11-07T09:00:00.000Z", "eind": "2026-11-08T16:00:00.000Z", "publiekeTitel": null, "interneTitel": "Expositie: Test Nick Hoevenaars", "slug": null, "contentStatus": "ontbreekt", "toonVanafMaanden": null}'::jsonb
) on conflict (legacy_source, legacy_id) do update set
  zichtbaarheid = excluded.zichtbaarheid,
  soort = excluded.soort,
  titel = excluded.titel,
  interne_titel = excluded.interne_titel,
  slug = excluded.slug,
  start_datum = excluded.start_datum,
  eind_datum = excluded.eind_datum,
  publicatie_trigger = excluded.publicatie_trigger,
  content_status = excluded.content_status,
  op_publieke_agenda = excluded.op_publieke_agenda,
  raw_sanity = excluded.raw_sanity;

insert into public.activiteit_bron (
  legacy_source, legacy_id, zichtbaarheid, soort, titel, interne_titel, slug,
  start_datum, eind_datum, publicatie_trigger, content_status, op_publieke_agenda, raw_sanity
) values (
  'sanity', 'ts3H06NnMrHW2SC9VoURky', 'verborgen', 'expositie', 'Expositie: Steven Van Meurs', 'Expositie: Steven Van Meurs', null,
  '2026-11-07'::date, '2026-11-08'::date, null, 'ontbreekt', false, '{"_id": "ts3H06NnMrHW2SC9VoURky", "zichtbaarheid": "verborgen", "soort": "expositie", "start": "2026-11-07T09:00:00.000Z", "eind": "2026-11-08T16:00:00.000Z", "publiekeTitel": null, "interneTitel": "Expositie: Steven Van Meurs", "slug": null, "contentStatus": "ontbreekt", "toonVanafMaanden": null}'::jsonb
) on conflict (legacy_source, legacy_id) do update set
  zichtbaarheid = excluded.zichtbaarheid,
  soort = excluded.soort,
  titel = excluded.titel,
  interne_titel = excluded.interne_titel,
  slug = excluded.slug,
  start_datum = excluded.start_datum,
  eind_datum = excluded.eind_datum,
  publicatie_trigger = excluded.publicatie_trigger,
  content_status = excluded.content_status,
  op_publieke_agenda = excluded.op_publieke_agenda,
  raw_sanity = excluded.raw_sanity;

insert into public.activiteit_bron (
  legacy_source, legacy_id, zichtbaarheid, soort, titel, interne_titel, slug,
  start_datum, eind_datum, publicatie_trigger, content_status, op_publieke_agenda, raw_sanity
) values (
  'sanity', 'ukYE0X2gfmSiDbVNb8Uho8', 'verborgen', 'concert', 'Concert: Daan de Swart', 'Concert: Daan de Swart', null,
  '2027-03-26'::date, '2027-03-26'::date, null, 'ontbreekt', false, '{"_id": "ukYE0X2gfmSiDbVNb8Uho8", "zichtbaarheid": "verborgen", "soort": "concert", "start": "2027-03-26T09:00:00.000Z", "eind": "2027-03-26T16:00:00.000Z", "publiekeTitel": null, "interneTitel": "Concert: Daan de Swart", "slug": null, "contentStatus": "ontbreekt", "toonVanafMaanden": null}'::jsonb
) on conflict (legacy_source, legacy_id) do update set
  zichtbaarheid = excluded.zichtbaarheid,
  soort = excluded.soort,
  titel = excluded.titel,
  interne_titel = excluded.interne_titel,
  slug = excluded.slug,
  start_datum = excluded.start_datum,
  eind_datum = excluded.eind_datum,
  publicatie_trigger = excluded.publicatie_trigger,
  content_status = excluded.content_status,
  op_publieke_agenda = excluded.op_publieke_agenda,
  raw_sanity = excluded.raw_sanity;

insert into public.activiteit_bron (
  legacy_source, legacy_id, zichtbaarheid, soort, titel, interne_titel, slug,
  start_datum, eind_datum, publicatie_trigger, content_status, op_publieke_agenda, raw_sanity
) values (
  'sanity', 'y3vBdxZBtQ6qbfdUZvDdKx', 'bezet', 'expositie', 'Expositie: Frank Biemans', 'Expositie: Frank Biemans', null,
  '2028-09-02'::date, '2028-09-03'::date, null, 'ontbreekt', false, '{"_id": "y3vBdxZBtQ6qbfdUZvDdKx", "zichtbaarheid": "bezet", "soort": "expositie", "start": "2028-09-02T09:00:00.000Z", "eind": "2028-09-03T16:00:00.000Z", "publiekeTitel": null, "interneTitel": "Expositie: Frank Biemans", "slug": null, "contentStatus": "ontbreekt", "toonVanafMaanden": null}'::jsonb
) on conflict (legacy_source, legacy_id) do update set
  zichtbaarheid = excluded.zichtbaarheid,
  soort = excluded.soort,
  titel = excluded.titel,
  interne_titel = excluded.interne_titel,
  slug = excluded.slug,
  start_datum = excluded.start_datum,
  eind_datum = excluded.eind_datum,
  publicatie_trigger = excluded.publicatie_trigger,
  content_status = excluded.content_status,
  op_publieke_agenda = excluded.op_publieke_agenda,
  raw_sanity = excluded.raw_sanity;

update public.publieke_activiteiten
set zichtbaarheid = 'publiek'
where legacy_source = 'sanity'
  and legacy_id in ('924d9c9e-6c99-4827-85ae-dc7623f2f5a6', '9cef6dd9-b0db-4930-beb2-839e1c52272e', 'EL8QbLNEvjfBr31EiB7Hu9', 'ab9411f9-9da4-454b-afda-8816a8d1798d', 'e3e063c0-3069-482d-874d-023c92cbb45f', 'e5b8622b-794e-4be1-a9eb-6c99f293808d')
  and zichtbaarheid is distinct from 'publiek';

insert into public.mediabestanden (
  legacy_source, legacy_id, bestandsnaam, mime_type, bytes, bron_url,
  gekoppeld_aan, runtime_gebruikt, doel_bucket, nieuwe_url, zichtbaarheid, migratiestatus
) values (
  'sanity', 'image-0fb6ba51f3d3d640e530cf7489adc786e3423b5d-241x300-jpg', 'images.jpg', 'image/jpeg', 14642, 'https://cdn.sanity.io/images/8le5jso9/production/0fb6ba51f3d3d640e530cf7489adc786e3423b5d-241x300.jpg',
  null, false, null, null, 'niet_gebruikt', 'overgeslagen_geen_koppeling'
) on conflict (legacy_source, legacy_id) do update set
  bestandsnaam = excluded.bestandsnaam,
  mime_type = excluded.mime_type,
  bytes = excluded.bytes,
  bron_url = excluded.bron_url,
  runtime_gebruikt = excluded.runtime_gebruikt,
  migratiestatus = excluded.migratiestatus;

insert into public.mediabestanden (
  legacy_source, legacy_id, bestandsnaam, mime_type, bytes, bron_url,
  gekoppeld_aan, runtime_gebruikt, doel_bucket, nieuwe_url, zichtbaarheid, migratiestatus
) values (
  'sanity', 'image-19787b8af5d350ae61304f70a1667cf7eefc8ff4-500x653-jpg', 'nono-web_compressed.jpg', 'image/jpeg', 47103, 'https://cdn.sanity.io/images/8le5jso9/production/19787b8af5d350ae61304f70a1667cf7eefc8ff4-500x653.jpg',
  null, false, null, null, 'niet_gebruikt', 'overgeslagen_geen_koppeling'
) on conflict (legacy_source, legacy_id) do update set
  bestandsnaam = excluded.bestandsnaam,
  mime_type = excluded.mime_type,
  bytes = excluded.bytes,
  bron_url = excluded.bron_url,
  runtime_gebruikt = excluded.runtime_gebruikt,
  migratiestatus = excluded.migratiestatus;

insert into public.mediabestanden (
  legacy_source, legacy_id, bestandsnaam, mime_type, bytes, bron_url,
  gekoppeld_aan, runtime_gebruikt, doel_bucket, nieuwe_url, zichtbaarheid, migratiestatus
) values (
  'sanity', 'image-202744770c80bfb39597a11dce1a1fe65610d84f-1080x1080-jpg', '12 en 13 september 2026 Pieter van Bernebeek en Hanneke Klievink.jpg', 'image/jpeg', 111173, 'https://cdn.sanity.io/images/8le5jso9/production/202744770c80bfb39597a11dce1a1fe65610d84f-1080x1080.jpg',
  null, false, null, null, 'niet_gebruikt', 'overgeslagen_geen_koppeling'
) on conflict (legacy_source, legacy_id) do update set
  bestandsnaam = excluded.bestandsnaam,
  mime_type = excluded.mime_type,
  bytes = excluded.bytes,
  bron_url = excluded.bron_url,
  runtime_gebruikt = excluded.runtime_gebruikt,
  migratiestatus = excluded.migratiestatus;

insert into public.mediabestanden (
  legacy_source, legacy_id, bestandsnaam, mime_type, bytes, bron_url,
  gekoppeld_aan, runtime_gebruikt, doel_bucket, nieuwe_url, zichtbaarheid, migratiestatus
) values (
  'sanity', 'image-415f0515e6a38df938996dfe48aba8e449a4c3cb-1992x2560-jpg', 'uitnodiging-Persingen2-2023-scaled.jpg', 'image/jpeg', 356900, 'https://cdn.sanity.io/images/8le5jso9/production/415f0515e6a38df938996dfe48aba8e449a4c3cb-1992x2560.jpg',
  null, false, null, null, 'niet_gebruikt', 'overgeslagen_geen_koppeling'
) on conflict (legacy_source, legacy_id) do update set
  bestandsnaam = excluded.bestandsnaam,
  mime_type = excluded.mime_type,
  bytes = excluded.bytes,
  bron_url = excluded.bron_url,
  runtime_gebruikt = excluded.runtime_gebruikt,
  migratiestatus = excluded.migratiestatus;

insert into public.mediabestanden (
  legacy_source, legacy_id, bestandsnaam, mime_type, bytes, bron_url,
  gekoppeld_aan, runtime_gebruikt, doel_bucket, nieuwe_url, zichtbaarheid, migratiestatus
) values (
  'sanity', 'image-650672f2186c9eb8f4c93c4c6eb917d724da981c-1056x1504-png', 'Expositie Kerkje van Persingen (2).png', 'image/png', 1094500, 'https://cdn.sanity.io/images/8le5jso9/production/650672f2186c9eb8f4c93c4c6eb917d724da981c-1056x1504.png',
  null, false, null, null, 'niet_gebruikt', 'overgeslagen_geen_koppeling'
) on conflict (legacy_source, legacy_id) do update set
  bestandsnaam = excluded.bestandsnaam,
  mime_type = excluded.mime_type,
  bytes = excluded.bytes,
  bron_url = excluded.bron_url,
  runtime_gebruikt = excluded.runtime_gebruikt,
  migratiestatus = excluded.migratiestatus;

insert into public.mediabestanden (
  legacy_source, legacy_id, bestandsnaam, mime_type, bytes, bron_url,
  gekoppeld_aan, runtime_gebruikt, doel_bucket, nieuwe_url, zichtbaarheid, migratiestatus
) values (
  'sanity', 'image-8848419296f2e9fe9005c4ef2f0939e473ef2176-327x246-jpg', 'Afbeelding1.jpg', 'image/jpeg', 31976, 'https://cdn.sanity.io/images/8le5jso9/production/8848419296f2e9fe9005c4ef2f0939e473ef2176-327x246.jpg',
  null, false, null, null, 'niet_gebruikt', 'overgeslagen_geen_koppeling'
) on conflict (legacy_source, legacy_id) do update set
  bestandsnaam = excluded.bestandsnaam,
  mime_type = excluded.mime_type,
  bytes = excluded.bytes,
  bron_url = excluded.bron_url,
  runtime_gebruikt = excluded.runtime_gebruikt,
  migratiestatus = excluded.migratiestatus;

insert into public.mediabestanden (
  legacy_source, legacy_id, bestandsnaam, mime_type, bytes, bron_url,
  gekoppeld_aan, runtime_gebruikt, doel_bucket, nieuwe_url, zichtbaarheid, migratiestatus
) values (
  'sanity', 'image-94ac0d873bc3fa1397f4dc853da68e05d7a0b61c-1485x1059-png', '29 en 30 augustus 2026 Denny Baggen en Frank Biemans.PNG', 'image/png', 2254098, 'https://cdn.sanity.io/images/8le5jso9/production/94ac0d873bc3fa1397f4dc853da68e05d7a0b61c-1485x1059.png',
  null, false, null, null, 'niet_gebruikt', 'overgeslagen_geen_koppeling'
) on conflict (legacy_source, legacy_id) do update set
  bestandsnaam = excluded.bestandsnaam,
  mime_type = excluded.mime_type,
  bytes = excluded.bytes,
  bron_url = excluded.bron_url,
  runtime_gebruikt = excluded.runtime_gebruikt,
  migratiestatus = excluded.migratiestatus;

insert into public.mediabestanden (
  legacy_source, legacy_id, bestandsnaam, mime_type, bytes, bron_url,
  gekoppeld_aan, runtime_gebruikt, doel_bucket, nieuwe_url, zichtbaarheid, migratiestatus
) values (
  'sanity', 'image-9ddfd1d7b4e10d179000a59045f5271178d661af-1247x1755-jpg', '5 en 6 september 2026 Suzan Van Lieshout.jpg', 'image/jpeg', 2008212, 'https://cdn.sanity.io/images/8le5jso9/production/9ddfd1d7b4e10d179000a59045f5271178d661af-1247x1755.jpg',
  null, false, null, null, 'niet_gebruikt', 'overgeslagen_geen_koppeling'
) on conflict (legacy_source, legacy_id) do update set
  bestandsnaam = excluded.bestandsnaam,
  mime_type = excluded.mime_type,
  bytes = excluded.bytes,
  bron_url = excluded.bron_url,
  runtime_gebruikt = excluded.runtime_gebruikt,
  migratiestatus = excluded.migratiestatus;

insert into public.mediabestanden (
  legacy_source, legacy_id, bestandsnaam, mime_type, bytes, bron_url,
  gekoppeld_aan, runtime_gebruikt, doel_bucket, nieuwe_url, zichtbaarheid, migratiestatus
) values (
  'sanity', 'image-ae128c904314ef08a772c35d3d3d385380285741-750x587-jpg', '19 en 20 september 2026 Maria Strikkeling e.a.jpg', 'image/jpeg', 83400, 'https://cdn.sanity.io/images/8le5jso9/production/ae128c904314ef08a772c35d3d3d385380285741-750x587.jpg',
  null, false, null, null, 'niet_gebruikt', 'overgeslagen_geen_koppeling'
) on conflict (legacy_source, legacy_id) do update set
  bestandsnaam = excluded.bestandsnaam,
  mime_type = excluded.mime_type,
  bytes = excluded.bytes,
  bron_url = excluded.bron_url,
  runtime_gebruikt = excluded.runtime_gebruikt,
  migratiestatus = excluded.migratiestatus;

insert into public.mediabestanden (
  legacy_source, legacy_id, bestandsnaam, mime_type, bytes, bron_url,
  gekoppeld_aan, runtime_gebruikt, doel_bucket, nieuwe_url, zichtbaarheid, migratiestatus
) values (
  'sanity', 'image-d6b7fd97ea0480f2fe5ce9e7b235c2c491b4f027-2481x3189-jpg', '22 en 23 aug. 2026 R. van Vucht en M. Koenenjpg.jpg', 'image/jpeg', 2282248, 'https://cdn.sanity.io/images/8le5jso9/production/d6b7fd97ea0480f2fe5ce9e7b235c2c491b4f027-2481x3189.jpg',
  null, false, null, null, 'niet_gebruikt', 'overgeslagen_geen_koppeling'
) on conflict (legacy_source, legacy_id) do update set
  bestandsnaam = excluded.bestandsnaam,
  mime_type = excluded.mime_type,
  bytes = excluded.bytes,
  bron_url = excluded.bron_url,
  runtime_gebruikt = excluded.runtime_gebruikt,
  migratiestatus = excluded.migratiestatus;

insert into public.mediabestanden (
  legacy_source, legacy_id, bestandsnaam, mime_type, bytes, bron_url,
  gekoppeld_aan, runtime_gebruikt, doel_bucket, nieuwe_url, zichtbaarheid, migratiestatus
) values (
  'sanity', 'image-e4d51052b9f3ff05f9056339335e12715d915a06-1024x1536-jpg', '15 en 16 augustus 2026 Triptiek.jpeg', 'image/jpeg', 298553, 'https://cdn.sanity.io/images/8le5jso9/production/e4d51052b9f3ff05f9056339335e12715d915a06-1024x1536.jpg',
  null, false, null, null, 'niet_gebruikt', 'overgeslagen_geen_koppeling'
) on conflict (legacy_source, legacy_id) do update set
  bestandsnaam = excluded.bestandsnaam,
  mime_type = excluded.mime_type,
  bytes = excluded.bytes,
  bron_url = excluded.bron_url,
  runtime_gebruikt = excluded.runtime_gebruikt,
  migratiestatus = excluded.migratiestatus;

insert into public.mediabestanden (
  legacy_source, legacy_id, bestandsnaam, mime_type, bytes, bron_url,
  gekoppeld_aan, runtime_gebruikt, doel_bucket, nieuwe_url, zichtbaarheid, migratiestatus
) values (
  'sanity', 'image-e6481eef453439e807c86e7bf4a829412a49d05e-420x595-webp', '4a3df7aeaeb88e363815194efc4966dc54146f6f_019fd810-57c4-7ab4-85f8-c724e0557616.webp', 'image/webp', 31646, 'https://cdn.sanity.io/images/8le5jso9/production/e6481eef453439e807c86e7bf4a829412a49d05e-420x595.webp',
  null, false, null, null, 'niet_gebruikt', 'overgeslagen_geen_koppeling'
) on conflict (legacy_source, legacy_id) do update set
  bestandsnaam = excluded.bestandsnaam,
  mime_type = excluded.mime_type,
  bytes = excluded.bytes,
  bron_url = excluded.bron_url,
  runtime_gebruikt = excluded.runtime_gebruikt,
  migratiestatus = excluded.migratiestatus;

insert into public.mediabestanden (
  legacy_source, legacy_id, bestandsnaam, mime_type, bytes, bron_url,
  gekoppeld_aan, runtime_gebruikt, doel_bucket, nieuwe_url, zichtbaarheid, migratiestatus
) values (
  'sanity', 'image-f7ea3182679c150414af27e21549c3ce48aaf382-500x653-avif', 'nono-web.avif', 'image/avif', 49618, 'https://cdn.sanity.io/images/8le5jso9/production/f7ea3182679c150414af27e21549c3ce48aaf382-500x653.avif',
  null, false, null, null, 'niet_gebruikt', 'overgeslagen_geen_koppeling'
) on conflict (legacy_source, legacy_id) do update set
  bestandsnaam = excluded.bestandsnaam,
  mime_type = excluded.mime_type,
  bytes = excluded.bytes,
  bron_url = excluded.bron_url,
  runtime_gebruikt = excluded.runtime_gebruikt,
  migratiestatus = excluded.migratiestatus;

insert into public.mediabestanden (
  legacy_source, legacy_id, bestandsnaam, mime_type, bytes, bron_url,
  gekoppeld_aan, runtime_gebruikt, doel_bucket, nieuwe_url, zichtbaarheid, migratiestatus
) values (
  'sanity', 'image-f866c5ebd5b8c7976ccb7cd02041d00de1c2701e-1536x1024-png', 'ChatGPT Image 7 aug 2026, 14_22_22.png', 'image/png', 1950179, 'https://cdn.sanity.io/images/8le5jso9/production/f866c5ebd5b8c7976ccb7cd02041d00de1c2701e-1536x1024.png',
  null, false, null, null, 'niet_gebruikt', 'overgeslagen_geen_koppeling'
) on conflict (legacy_source, legacy_id) do update set
  bestandsnaam = excluded.bestandsnaam,
  mime_type = excluded.mime_type,
  bytes = excluded.bytes,
  bron_url = excluded.bron_url,
  runtime_gebruikt = excluded.runtime_gebruikt,
  migratiestatus = excluded.migratiestatus;

insert into public.mediabestanden (
  legacy_source, legacy_id, bestandsnaam, mime_type, bytes, bron_url,
  gekoppeld_aan, runtime_gebruikt, doel_bucket, nieuwe_url, zichtbaarheid, migratiestatus
) values (
  'sanity', 'image-fc173b38de750caf0adfb6da5e4ff0a574e4dbf7-4079x4079-jpg', 'Nick Hoevenaars - Kracht Portretten.jpg', 'image/jpeg', 7871487, 'https://cdn.sanity.io/images/8le5jso9/production/fc173b38de750caf0adfb6da5e4ff0a574e4dbf7-4079x4079.jpg',
  null, false, null, null, 'niet_gebruikt', 'overgeslagen_geen_koppeling'
) on conflict (legacy_source, legacy_id) do update set
  bestandsnaam = excluded.bestandsnaam,
  mime_type = excluded.mime_type,
  bytes = excluded.bytes,
  bron_url = excluded.bron_url,
  runtime_gebruikt = excluded.runtime_gebruikt,
  migratiestatus = excluded.migratiestatus;

insert into public.mediabestanden (
  legacy_source, legacy_id, bestandsnaam, mime_type, bytes, bron_url,
  gekoppeld_aan, runtime_gebruikt, doel_bucket, nieuwe_url, zichtbaarheid, migratiestatus
) values (
  'sanity', 'image-fd125267a79b361180a192e51369cef8b12dfdcd-1536x1024-png', '0db64368-82cf-4eca-a211-f64b53a25dc9.png', 'image/png', 2512988, 'https://cdn.sanity.io/images/8le5jso9/production/fd125267a79b361180a192e51369cef8b12dfdcd-1536x1024.png',
  null, false, null, null, 'niet_gebruikt', 'overgeslagen_geen_koppeling'
) on conflict (legacy_source, legacy_id) do update set
  bestandsnaam = excluded.bestandsnaam,
  mime_type = excluded.mime_type,
  bytes = excluded.bytes,
  bron_url = excluded.bron_url,
  runtime_gebruikt = excluded.runtime_gebruikt,
  migratiestatus = excluded.migratiestatus;
