-- De nieuwsbriefcron mag de vriendenmail en de donderdagpreview versturen.

select public.zet_automatisering_status('nieuwsbrief', 'actief', 'migratie');
