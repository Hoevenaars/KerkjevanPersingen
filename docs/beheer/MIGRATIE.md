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

In `/beheer/migratie/` (live Sanity) of via `npm run migratie:dry-run`.

| Controle | Sanity | Nieuw |
| --- | ---: | ---: |
| Activiteiten | live | boekingen + interne activiteiten |
| Toekomstige activiteiten | live | live |
| Bezette dagen (oude vs nieuwe regel) | `huidigeBezetteDagen()` | `publiekeBezetteDagen()` |
| Aanvragen | live | live |
| Actieve vrienden | live | live |
| Inactieve vrienden | live | live |
| Nieuwsbrieven | live | live |

Bezette dagen: eerst vergelijken met `huidigeBezetteDagen()` (Sanity-gedrag),
daarna pas met `publiekeBezetteDagen()` (FO: alleen definitief + interne
blokkade). Zie `docs/beheer/HUIDIGE-GEDRAG.md`.

Dry-run zonder website-cutover:

```bash
npm run migratie:dry-run
npm run migratie:dry-run -- --fixture tests/fixtures/sanity-dump.json
```
