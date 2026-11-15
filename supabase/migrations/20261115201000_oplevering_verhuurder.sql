-- Vul ontbrekende contractgegevens met wat al op de site staat.
-- Een bestaande waarde blijft staan. De gereed-regel blijft leeg.
-- Losse mails uit beheer gaan naar het testadres, niet naar de huurder.

insert into public.instellingen (sleutel, groep, waarde, toelichting) values
  ('documentenflow_ondertekenaar_naam', 'documentenflow', to_jsonb('Nelleke van der Pol'::text), 'Bevoegde ondertekenaar'),
  ('documentenflow_ondertekenaar_functie', 'documentenflow', to_jsonb('Contractbeheer'::text), 'Functie van de ondertekenaar'),
  ('documentenflow_iban', 'documentenflow', to_jsonb('NL21RABO0105101699'::text), 'IBAN voor verhuur, het rekeningnummer van Steun ons'),
  ('documentenflow_tenaamstelling', 'documentenflow', to_jsonb('Stichting Het Kerkje van Persingen'::text), 'Tenaamstelling van de huurrekening'),
  ('documentenflow_voorwaarden_vastgesteld_op', 'documentenflow', to_jsonb('2026-11-15'::text), 'Datum formele vaststelling voorwaarden'),
  ('documentenflow_huisregels_vastgesteld_op', 'documentenflow', to_jsonb('2026-11-15'::text), 'Datum formele vaststelling huisregels'),
  ('documentenflow_coordinator', 'documentenflow', to_jsonb('contractbeheer.kvp@gmail.com'::text), 'Contact van de coördinator voor exposanten'),
  ('documentenflow_publicatie_route', 'documentenflow', to_jsonb('https://kerkjepersingen.nl/contact/'::text), 'Waar promotiemateriaal naartoe gaat')
on conflict (sleutel) do nothing;

with gewijzigd as (
  update public.automatiseringen
  set status = 'test',
      gewijzigd_door = 'oplevering',
      gewijzigd_op = now(),
      actief_vanaf = coalesce(actief_vanaf, (timezone('Europe/Amsterdam', now()))::date)
  where sleutel = 'handmatige_template'
    and status = 'uit'
  returning sleutel
)
insert into public.automatisering_audit (automatisering_sleutel, oude_status, nieuwe_status, gebruiker)
select sleutel, 'uit', 'test', 'oplevering' from gewijzigd;
