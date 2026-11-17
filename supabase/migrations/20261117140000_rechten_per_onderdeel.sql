-- Onderdelen die in het menu los van hun oude module staan.
-- Een ontbrekende rij erft in de applicatie nog van de oude module.
-- Een expliciete rij wint, ook als die verborgen is.

insert into public.modules (sleutel, naam, volgorde) values
  ('handmatige_boeking', 'Handmatige boeking', 30),
  ('website_banner', 'Banner', 31),
  ('website_extra_balk', 'Extra balk', 32),
  ('reservelijst', 'Reserve lijst', 33),
  ('verhuur_instellingen', 'Verhuurinstellingen', 34),
  ('contractsjabloon', 'Contractsjabloon', 35)
on conflict (sleutel) do nothing;

create policy instellingen_website_banner_select on public.instellingen
  for select to authenticated
  using (
    sleutel = 'vrijgekomen_weekend_banner'
    and (select app.heeft_recht('website_banner', 'lezen'))
  );

create policy instellingen_website_banner_schrijven on public.instellingen
  for all to authenticated
  using (
    sleutel = 'vrijgekomen_weekend_banner'
    and (select app.heeft_recht('website_banner', 'schrijven'))
  )
  with check (
    sleutel = 'vrijgekomen_weekend_banner'
    and (select app.heeft_recht('website_banner', 'schrijven'))
  );

create policy instellingen_website_melding_select on public.instellingen
  for select to authenticated
  using (
    sleutel = 'website_melding'
    and (select app.heeft_recht('website_extra_balk', 'lezen'))
  );

create policy instellingen_website_melding_schrijven on public.instellingen
  for all to authenticated
  using (
    sleutel = 'website_melding'
    and (select app.heeft_recht('website_extra_balk', 'schrijven'))
  )
  with check (
    sleutel = 'website_melding'
    and (select app.heeft_recht('website_extra_balk', 'schrijven'))
  );
