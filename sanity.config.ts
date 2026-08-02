import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { schemaTypes } from './sanity/schemas';

/**
 * Sanity Studio, ingericht voor bestuursleden die niet handig zijn met computers.
 *
 * Uitgangspunten:
 * - Nederlandse labels overal, geen Engelse termen.
 * - "Agenda en boekingen" staat bovenaan, want dat is de enige dagelijkse taak.
 * - "Instellingen" is een apart, enkelvoudig item onderin — daar hoort het
 *   ontvangstadres, niet tussen de activiteiten waar het per ongeluk leeggemaakt
 *   kan worden.
 */
export default defineConfig({
  name: 'kerkje-van-persingen',
  title: 'Kerkje van Persingen',
  // Hardcoded, met env-variabele als terugval. De GitHub Action die dit deployt
  // geeft alleen SANITY_STUDIO_PROJECT_ID mee, geen dataset-variabele — vaste
  // waarde hier voorkomt dat de Studio zonder project-ID probeert te bouwen.
  projectId: process.env.SANITY_STUDIO_PROJECT_ID ?? '8le5jso9',
  dataset: process.env.SANITY_STUDIO_DATASET ?? 'production',
  plugins: [
    structureTool({
      structure: (S) =>
        S.list()
          .title('Beheer')
          .items([
            S.listItem()
              .title('Agenda en boekingen')
              .child(
                S.documentTypeList('activiteit')
                  .title('Agenda en boekingen')
                  .defaultOrdering([{ field: 'start', direction: 'asc' }])
              ),
            S.divider(),
            S.listItem()
              .title('Instellingen')
              .child(S.document().schemaType('instellingen').documentId('instellingen')),
          ]),
    }),
  ],
  schema: { types: schemaTypes },
});
