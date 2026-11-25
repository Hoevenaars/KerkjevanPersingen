-- De vriendenmail gaat woensdag om 11:30 Nederlandse tijd de deur uit.
-- De donderdag-previewcron is geen dry-run meer; die staat niet meer ingepland.

update public.automatiseringen
set
  trigger_tekst = 'Cron woensdag 11:30',
  omschrijving = 'Wekelijkse vriendenmail. Verzending woensdag om 11:30 Nederlandse tijd.'
where sleutel = 'nieuwsbrief';
