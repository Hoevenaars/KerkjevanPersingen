-- Contactpersoon contractbeheer: Nelleke van der Pol wordt Hans Maas.
-- Al opgeslagen mailteksten en de bevoegde ondertekenaar. Verzonden contracten blijven staan.

update public.communicatie_template_versies
set inhoud = replace(inhoud, 'Nelleke van der Pol', 'Hans Maas')
where inhoud like '%Nelleke van der Pol%';

update public.instellingen
set
  waarde = to_jsonb(replace(waarde #>> '{}', 'Nelleke van der Pol', 'Hans Maas')),
  bijgewerkt_op = now()
where jsonb_typeof(waarde) = 'string'
  and (waarde #>> '{}') like '%Nelleke van der Pol%';
