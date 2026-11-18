-- Aanvulling na 20261117180000_verhuurproces_aan.sql.
-- Die migratie zette betaalherinnering op actief. V5 mag die schakelaar niet aan laten.
-- Alleen betaalherinnering gaat naar uit. De andere verhuurschakelaars blijven zoals ze zijn.
-- zet_automatisering_status doet niets wanneer de status al uit is.
-- Deze migratie is nog niet op productie uitgevoerd.

select public.zet_automatisering_status('betaalherinnering', 'uit', 'v5-acceptatie');
