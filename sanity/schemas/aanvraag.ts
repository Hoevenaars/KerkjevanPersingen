import { defineField, defineType } from 'sanity';

/**
 * Een binnenkomende verhuuraanvraag, los van de agenda.
 *
 * Bewust een eigen type: een afgewezen aanvraag mag de kalender niet blokkeren,
 * en een goedgekeurde aanvraag wordt later een `activiteit`. Tot die automatische
 * koppeling live is, kun je hier al ja/nee vastleggen en handmatig een boeking
 * aanmaken.
 */
export const aanvraag = defineType({
  name: 'aanvraag',
  title: 'Verhuuraanvraag',
  type: 'document',
  fields: [
    defineField({
      name: 'binnengekomenOp',
      title: 'Binnengekomen op',
      type: 'datetime',
      readOnly: true,
      initialValue: () => new Date().toISOString(),
    }),
    defineField({
      name: 'status',
      title: 'Beoordeling',
      type: 'string',
      initialValue: 'nieuw',
      options: {
        list: [
          { title: 'Nieuw — nog beoordelen', value: 'nieuw' },
          { title: 'Ja — gaat door', value: 'ja' },
          { title: 'Nee — afgewezen', value: 'nee' },
        ],
        layout: 'radio',
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'afwijsreden',
      title: 'Reden bij nee (intern)',
      type: 'text',
      rows: 2,
      hidden: ({ document }) => document?.status !== 'nee',
    }),
    defineField({
      name: 'boeking',
      title: 'Gekoppelde boeking',
      description:
        'Later automatisch bij "ja". Nu: koppel hier de activiteit als je die handmatig hebt aangemaakt.',
      type: 'reference',
      to: [{ type: 'activiteit' }],
      hidden: ({ document }) => document?.status === 'nee',
    }),
    defineField({
      name: 'naam',
      title: 'Naam',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'email',
      title: 'E-mailadres',
      type: 'string',
      validation: (Rule) => Rule.required().email(),
    }),
    defineField({
      name: 'telefoon',
      title: 'Telefoon',
      type: 'string',
    }),
    defineField({
      name: 'adres',
      title: 'Adres',
      type: 'text',
      rows: 2,
    }),
    defineField({
      name: 'soort',
      title: 'Soort bijeenkomst',
      type: 'string',
      options: {
        list: [
          { title: 'Expositie', value: 'expositie' },
          { title: 'Bruiloft', value: 'bruiloft' },
          { title: 'Concert', value: 'concert' },
          { title: 'Diverse bijeenkomsten', value: 'diverse' },
        ],
      },
    }),
    defineField({
      name: 'datum',
      title: 'Gewenste startdatum',
      type: 'date',
    }),
    defineField({
      name: 'datumTot',
      title: 'Gewenste einddatum',
      type: 'date',
    }),
    defineField({
      name: 'personen',
      title: 'Aantal personen',
      type: 'string',
    }),
    defineField({
      name: 'toelichting',
      title: 'Toelichting van de aanvrager',
      type: 'text',
      rows: 4,
    }),
    defineField({
      name: 'website',
      title: 'Website of portfolio',
      type: 'string',
      hidden: ({ document }) => document?.soort !== 'expositie',
    }),
    defineField({
      name: 'eerderGeexposeerd',
      title: 'Eerder geëxposeerd',
      type: 'string',
      options: {
        list: [
          { title: 'Ja', value: 'ja' },
          { title: 'Nee', value: 'nee' },
        ],
        layout: 'radio',
      },
      hidden: ({ document }) => document?.soort !== 'expositie',
    }),
    defineField({
      name: 'medeExposanten',
      title: 'Mede-exposanten',
      type: 'text',
      rows: 2,
      hidden: ({ document }) => document?.soort !== 'expositie',
    }),
  ],
  orderings: [
    {
      title: 'Nieuwste eerst',
      name: 'binnengekomenDesc',
      by: [{ field: 'binnengekomenOp', direction: 'desc' }],
    },
  ],
  preview: {
    select: {
      title: 'naam',
      soort: 'soort',
      datum: 'datum',
      status: 'status',
    },
    prepare({ title, soort, datum, status }) {
      const labels: Record<string, string> = {
        nieuw: 'Nieuw',
        ja: 'Ja',
        nee: 'Nee',
      };
      const wanneer = datum
        ? new Date(`${datum}T12:00:00Z`).toLocaleDateString('nl-NL', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        : 'geen datum';
      return {
        title: title || 'Naamloos',
        subtitle: `${labels[status] ?? status} · ${soort ?? 'onbekend'} · ${wanneer}`,
      };
    },
  },
});
