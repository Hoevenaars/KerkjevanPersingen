-- Handmatig publiceren betekent: nu online.
-- Het formulierwoord "direct" werd tot nu toe weggeschreven als zodra_content_compleet.
-- Die enumwaarde blijft bestaan voor "wacht tot de content compleet is".
-- 'direct' is een aparte waarde zodat een bewuste publicatie later niet alsnog
-- door een contentstatus wordt tegengehouden.

alter type public.publicatie_trigger add value if not exists 'direct';
