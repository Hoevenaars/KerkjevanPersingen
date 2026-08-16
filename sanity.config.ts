import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { schemaTypes } from './sanity/schemas';

/**
 * Sanity Studio, ingericht voor bestuursleden die niet handig zijn met computers.
 *
 * "Aankomend" staat bovenaan en is de standaardweergave: alleen toekomstige
 * activiteiten, zodat je niet eerst langs de historische boekingen hoeft te
 * scrollen om bij vandaag te komen. "Alles" bevat het volledige archief.
 */
export default defineConfig({
  name: 'kerkje-van-persingen',
  title: 'Kerkje van Persingen',
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
                S.list()
                  .title('Agenda en boekingen')
                  .items([
                    S.listItem()
                      .title('Aankomend')
                      .child(
                        S.documentList()
                          .title('Aankomende activiteiten')
                          .filter('_type == "activiteit" && start >= now()')
                          .defaultOrdering([{ field: 'start', direction: 'asc' }])
                      ),
                    S.listItem()
                      .title('Alles (archief)')
                      .child(
                        S.documentList()
                          .title('Alle activiteiten')
                          .filter('_type == "activiteit"')
                          .defaultOrdering([{ field: 'start', direction: 'desc' }])
                      ),
                    S.listItem()
                      .title('Aanvragen')
                      .child(
                        S.documentList()
                          .title('Verhuuraanvragen')
                          .filter('_type == "aanvraag"')
                          .defaultOrdering([{ field: 'binnengekomenOp', direction: 'desc' }])
                      ),
                    S.listItem()
                      .title('Nieuwe aanvragen')
                      .child(
                        S.documentList()
                          .title('Nog te beoordelen')
                          .filter('_type == "aanvraag" && status == "nieuw"')
                          .defaultOrdering([{ field: 'binnengekomenOp', direction: 'desc' }])
                      ),
                  ])
              ),
            S.divider(),
            S.listItem()
              .title('Mensen')
              .child(
                S.list()
                  .title('Mensen')
                  .items([
                    S.listItem()
                      .title('Iedereen')
                      .child(
                        S.documentTypeList('persoon')
                          .title('Mensen')
                          .defaultOrdering([{ field: 'naam', direction: 'asc' }])
                      ),
                    S.listItem()
                      .title('Reservelijst exposities')
                      .child(
                        S.documentList()
                          .title('Reservelijst')
                          .filter('_type == "persoon" && opReservelijst == true')
                          .defaultOrdering([{ field: 'naam', direction: 'asc' }])
                      ),
                    S.listItem()
                      .title('Gastheren en gastvrouwen')
                      .child(
                        S.documentList()
                          .title('Gastheren en gastvrouwen')
                          .filter('_type == "persoon" && "gastheer" in rollen')
                          .defaultOrdering([{ field: 'naam', direction: 'asc' }])
                      ),
                  ])
              ),
            S.divider(),
            S.listItem()
              .title('Vrienden van het kerkje')
              .child(
                S.list()
                  .title('Vrienden van het kerkje')
                  .items([
                    S.listItem()
                      .title('Vriendenlijst')
                      .child(
                        S.documentTypeList('vriend')
                          .title('Vriendenlijst')
                          .defaultOrdering([{ field: 'aangemeldOp', direction: 'desc' }])
                      ),
                    S.listItem()
                      .title('Wekelijkse nieuwsbrief')
                      .child(
                        S.documentTypeList('nieuwsbrief')
                          .title('Wekelijkse nieuwsbrief')
                          .defaultOrdering([{ field: 'week', direction: 'desc' }])
                      ),
                  ])
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
