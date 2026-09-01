# Migratie Sanity → beheerplatform

Uitgangspunt: **alles meenemen**, daarna opschonen vanuit `/beheer`.

## Volgorde (FO §73)

```text
Nieuwe database
→ Beheeromgeving (achter vlag)
→ Sanity-import (legacy_source + legacy_id)
→ Controle (aantallen + steekproef)
→ Website leest nieuwe backend          ← nog niet
→ Formulieren schrijven naar nieuwe backend  ← nog niet
→ Nieuwsbrief overzetten                ← nog niet
→ Parallelcontrole
→ Sanity read-only
→ Sanity uitschakelen
```

Per datatype is er maar één schrijvende bron. Die staat in `public.bronnen`.

## Snapshot vóór import

```bash
chmod +x scripts/sanity-snapshot.sh
./scripts/sanity-snapshot.sh
```

Of: `npm run sanity:export`. Bewaar het `.tar.gz` buiten de repo.

## Veldmapping

De mapping staat in `src/platform/migratie.ts` (`SANITY_MAPPING`).

Bijzonderheden:

- `activiteit` splitst in `boekingen` + eventueel `publieke_activiteiten` +
  eventueel `interne_activiteiten` (soort `blokkade`).
- Aanvraagstatus `ja`/`nee` wordt `goedgekeurd`/`afgewezen`.
- `boekingStatus` `vastgelegd` wordt `migratie_vastgelegd` zodat we oude
  handmatige boekingen herkennen. Nieuwe harde weekend-/weekdagregels worden
  **niet** op historische rijen afgedwongen.
- Elk record: `legacy_source = 'sanity'`, `legacy_id = _id`. Ongebruikte velden
  gaan in `raw_sanity jsonb`.

## Controlelijst (FO §74)

| Controle | Sanity | Nieuw |
| --- | ---: | ---: |
| Activiteiten | | |
| Toekomstige activiteiten | | |
| Bezette dagen (oude vs nieuwe regel) | | |
| Aanvragen | | |
| Actieve vrienden | | |
| Inactieve vrienden | | |
| Nieuwsbrieven | | |

Bezette dagen: eerst vergelijken met `huidigeBezetteDagen()` (Sanity-gedrag),
daarna pas met `publiekeBezetteDagen()` (FO: alleen definitief + interne
blokkade). Zie `docs/beheer/HUIDIGE-GEDRAG.md`.
