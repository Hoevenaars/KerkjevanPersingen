-- Een nieuwsbriefconcept moet vier weken voor de verzendvrijdag bestaan.
-- Bestaande weken krijgen het moment van deze migratie als openingsdatum.

alter table public.nieuwsbrieven
  add column if not exists aangemaakt_op timestamptz not null default now();

comment on column public.nieuwsbrieven.aangemaakt_op is
  'Moment waarop het concept is geopend. Verzenden mag pas als dit minstens 28 dagen voor de vrijdag van week_maandag ligt.';
