-- Fase 7: Supabase is de enige schrijvende runtimebron.
-- Het enum heet 'beheer': dat is het Supabase-beheer, niet Sanity.
-- Geen rijen in domeintabellen worden gewijzigd.

update public.bronnen
set schrijvende_bron = 'beheer',
    toelichting = 'Supabase is de enige schrijvende bron na de cutover. Geen dual-write.'
where datatype in (
  'aanvragen',
  'boekingen',
  'publieke_activiteiten',
  'interne_activiteiten',
  'relaties',
  'vrienden',
  'nieuwsbrieven',
  'instellingen',
  'templates'
);
