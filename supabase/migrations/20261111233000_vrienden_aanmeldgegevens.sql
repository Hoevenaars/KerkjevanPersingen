-- Extra gegevens van /vrienden/aanmelden/.
-- Geboortedatum is optioneel en bedoeld voor een latere verjaardagsmail.
-- Bestaande rijen blijven geldig: de nieuwe kolommen zijn leeg.

alter table public.vrienden
  add column if not exists voornaam text,
  add column if not exists achternaam text,
  add column if not exists telefoon text,
  add column if not exists geboortedatum date,
  add column if not exists toestemming_op timestamptz;

alter table public.vrienden
  drop constraint if exists vrienden_geboortedatum_check;

alter table public.vrienden
  add constraint vrienden_geboortedatum_check
  check (geboortedatum is null or (geboortedatum >= date '1900-01-01' and geboortedatum <= current_date));

comment on column public.vrienden.voornaam is 'Verplicht bij nieuwe aanmelding. Leeg bij oudere rijen.';
comment on column public.vrienden.achternaam is 'Verplicht bij nieuwe aanmelding. Leeg bij oudere rijen.';
comment on column public.vrienden.telefoon is 'Optioneel telefoonnummer van de vriend.';
comment on column public.vrienden.geboortedatum is 'Optioneel. Bedoeld voor een verjaardagsfelicitatie, nog zonder eigen verzendtaak.';
comment on column public.vrienden.toestemming_op is 'Moment waarop de vriend toestemming gaf voor de vriendenmail.';
