-- Centrale poort voor betalingscommunicatie.
-- Blijft uit na uitrol. Een featurevlag of een eerdere migratie zet haar niet aan.
-- 20261117180000 zette betaalherinnering op actief en wordt niet herschreven.
-- Deze aanvulling zet die herinnering én de nieuwe poort op uit.
-- zet_automatisering_status doet niets wanneer de status al uit is.
-- Nog niet op productie uitgevoerd.

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
  'betalingscommunicatie',
  'Betalingscommunicatie',
  'Centrale poort voor betalingsverzoeken, facturen, herinneringen en betaallinks. Blijft uit tot iemand deze schakelaar zelf op Aan zet.',
  'automatisering',
  'uit',
  'automatisering',
  'Elke route die een betaling vraagt of een factuur meestuurt',
  true,
  'Huurder en finance',
  true
)
on conflict (sleutel) do nothing;

select public.zet_automatisering_status('betalingscommunicatie', 'uit', 'v5-acceptatie');
select public.zet_automatisering_status('betaalherinnering', 'uit', 'v5-acceptatie');

-- Een factuurnummer ontstaat pas als de poort op Aan staat.
-- Concepten schrijven niet naar deze tabel en blijven dus mogelijk.
create or replace function public.facturen_eisen_betalingscommunicatie()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1
      from public.automatiseringen
     where sleutel = 'betalingscommunicatie'
       and status = 'actief'
  ) then
    raise exception 'Betalingscommunicatie staat uit. Er is geen factuur uitgegeven.';
  end if;
  return new;
end;
$$;

revoke all on function public.facturen_eisen_betalingscommunicatie() from public, anon, authenticated;

drop trigger if exists facturen_eisen_betalingscommunicatie on public.facturen;
create trigger facturen_eisen_betalingscommunicatie
  before insert on public.facturen
  for each row execute function public.facturen_eisen_betalingscommunicatie();
