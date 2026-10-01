-- Onderscheid tussen schakelaar en echte trigger. Geblokkeerde mail is geen annulering.
-- Wijzigt geen historische domeinrijen.

alter type public.communicatie_status add value if not exists 'geblokkeerd';

alter table public.automatiseringen
  add column if not exists actieve_trigger boolean not null default true;

update public.automatiseringen
set omschrijving = 'Notificatie naar het bestuur bij een contactbericht. De contactpagina heeft geen formulier, dus er ontstaat nu geen mail.',
    actieve_trigger = false
where sleutel = 'contact_bestuur';

update public.automatiseringen
set actieve_trigger = false
where sleutel in ('aanvraag_bevestiging', 'reservelijst_mail', 'handmatige_template');
