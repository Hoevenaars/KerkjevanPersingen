# Migratie naar het beheerplatform

De overstap is afgerond. Supabase is de enige bron voor website en beheer.

Per datatype is er één schrijvende bron. Die staat in `public.bronnen` en heet `beheer`.

Historische rijen houden `legacy_id`. Ongebruikte importdetails staan in `importpayload`.
De brugtabellen en de importfunctie zijn verwijderd. Boekingen, betalingen en activiteiten blijven staan.
