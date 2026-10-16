-- Demo feedback ronde 1.
-- Additief: één lege instelling en één nieuwe automatisering op Uit.
-- Wijzigt geen bestaande status, geen actief_vanaf en geen productiedata.

insert into public.instellingen (sleutel, groep, waarde, toelichting)
values (
  'social_media_content_email',
  'mail',
  to_jsonb(''::text),
  'Goedgekeurde content voor exposities wordt naar dit adres gestuurd zolang automatische publicatie naar social media nog niet actief is.'
)
on conflict (sleutel) do nothing;

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
)
values (
  'social_media_content',
  'Social media content',
  'Goedgekeurde expositiecontent naar het ingestelde social-media-adres. Geen Facebook-koppeling. De schakelaar start uit.',
  'automatisering',
  'uit',
  'automatisering',
  'Content goedgekeurd',
  true,
  'Social media ontvanger',
  true
)
on conflict (sleutel) do nothing;
