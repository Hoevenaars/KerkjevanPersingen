-- Het verhuurproces mag mailen: ontvangst, status, betaling, content,
-- praktische herinnering, expositiebegeleider en nazorg, plus de ochtendplanner.
-- zet_automatisering_status zet actief_vanaf op vandaag als die nog leeg is.
-- Een bestaande grens blijft staan. De planner gebruikt de grens van workflow.
-- Migratieboekingen blijven buiten de planner.
-- Reservelijst, social media, testmail en gebruikersuitnodiging blijven zoals ze staan.

select public.zet_automatisering_status('workflow', 'actief', 'migratie');
select public.zet_automatisering_status('aanvraag_bevestiging', 'actief', 'migratie');
select public.zet_automatisering_status('statusmail_huurder', 'actief', 'migratie');
select public.zet_automatisering_status('betaalherinnering', 'actief', 'migratie');
select public.zet_automatisering_status('content_herinnering', 'actief', 'migratie');
select public.zet_automatisering_status('herinnering', 'actief', 'migratie');
select public.zet_automatisering_status('gastheer_mail', 'actief', 'migratie');
select public.zet_automatisering_status('nazorg', 'actief', 'migratie');
