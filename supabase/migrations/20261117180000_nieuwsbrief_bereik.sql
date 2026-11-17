-- Per ontvanger: of de nieuwsbrief is geopend en of de activiteitlink is aangeklikt.
-- Geen IP-adres en geen user-agent. De bestaande leesrechten van de nieuwsbrief gelden.

alter table public.nieuwsbrief_verzendingen
  add column if not exists provider_id text,
  add column if not exists geopend_op timestamptz,
  add column if not exists activiteit_geklikt_op timestamptz;

create unique index if not exists nieuwsbrief_verzendingen_provider_id_uniek
  on public.nieuwsbrief_verzendingen (provider_id)
  where provider_id is not null;
