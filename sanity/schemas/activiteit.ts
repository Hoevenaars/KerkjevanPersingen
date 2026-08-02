import { defineType, defineField } from 'sanity';

/**
 * Eén invoer, drie weergaven.
 *
 * Dit ene document voedt de beschikbaarheidskalender, de publieke agenda en het blok
 * "eerstvolgende activiteit" op de landingspagina. Het bestuur voert een boeking dus
 * één keer in en kiest daarna wat er naar buiten gaat.
 *
 * Standaard is 'bezet': de datum wordt geblokkeerd, maar niemand ziet van wie.
 * Zou 'verborgen' de standaard zijn, dan toont de kalender een bezette datum als vrij
 * en volgen er dubbele boekingen. Privacy staat hiermee standaard aan zonder dat het
 * de kalender onbetrouwbaar maakt.
 */
export const activiteit = defineType({
  name: 'activiteit',
  title: 'Activiteit of boeking',
  type: 'document',
  fields: [
    defineField({
      name: 'interneTitel',
      title: 'Interne titel',
      description: 'Voor jullie eigen administratie. Komt nooit op de website.',
      type: 'string',
      validation: (Rule) => Rule.required().min(2),
    }),
    defineField({
      name: 'start',
      title: 'Datum en begintijd',
      type: 'datetime',
      options: { dateFormat: 'DD-MM-YYYY', timeFormat: 'HH:mm' },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'eind',
      title: 'Eindtijd',
      type: 'datetime',
      options: { dateFormat: 'DD-MM-YYYY', timeFormat: 'HH:mm' },
    }),
    defineField({
      name: 'soort',
      title: 'Soort',
      type: 'string',
      options: {
        list: [
          { title: 'Bruiloft', value: 'bruiloft' },
          { title: 'Concert', value: 'concert' },
          { title: 'Expositie', value: 'expositie' },
          { title: 'Vergadering', value: 'vergadering' },
          { title: 'Viering of dienst', value: 'viering' },
          { title: 'Blokkade (onderhoud, niet verhuurbaar)', value: 'blokkade' },
        ],
        layout: 'dropdown',
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'zichtbaarheid',
      title: 'Wat mag hiervan op de website?',
      type: 'string',
      initialValue: 'bezet',
      options: {
        list: [
          { title: 'Alleen "bezet" tonen — geen details', value: 'bezet' },
          { title: 'Volledig publiek — in de agenda', value: 'publiek' },
          { title: 'Verborgen — alleen intern, blokkeert de datum niet', value: 'verborgen' },
        ],
        layout: 'radio',
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'publiekeTitel',
      title: 'Publieke titel',
      description:
        'Wat bezoekers zien. Bijvoorbeeld "Bruiloft" in plaats van "Bruiloft van Kim en Jeroen".',
      type: 'string',
      hidden: ({ document }) => document?.zichtbaarheid !== 'publiek',
      validation: (Rule) =>
        Rule.custom((value, context) => {
          const doc = context.document as { zichtbaarheid?: string } | undefined;
          if (doc?.zichtbaarheid === 'publiek' && !value) {
            return 'Vul een publieke titel in, of zet de zichtbaarheid op "alleen bezet".';
          }
          return true;
        }),
    }),
    defineField({
      name: 'slug',
      title: 'Webadres',
      type: 'slug',
      options: { source: 'publiekeTitel', maxLength: 80 },
      hidden: ({ document }) => document?.zichtbaarheid !== 'publiek',
    }),
    defineField({
      name: 'omschrijving',
      title: 'Omschrijving',
      description: 'Korte tekst voor de agenda en de voorpagina.',
      type: 'text',
      rows: 4,
      hidden: ({ document }) => document?.zichtbaarheid !== 'publiek',
    }),
    defineField({
      name: 'foto',
      title: 'Foto',
      description:
        'Bijvoorbeeld van de exposant of de collectie. Formaat maakt niet uit, dat wordt automatisch geregeld.',
      type: 'image',
      options: { hotspot: true },
      hidden: ({ document }) => document?.zichtbaarheid !== 'publiek',
    }),
    defineField({
      name: 'fotoAlt',
      title: 'Beschrijving van de foto',
      description:
        'Voor mensen die de foto niet kunnen zien. Beschrijf kort wat erop staat.',
      type: 'string',
      hidden: ({ document }) => !document?.foto,
      validation: (Rule) =>
        Rule.custom((value, context) => {
          const doc = context.document as { foto?: unknown } | undefined;
          if (doc?.foto && !value) return 'Vul een beschrijving in bij de foto.';
          return true;
        }),
    }),
    defineField({
      name: 'toestemmingBeeld',
      title: 'Toestemming voor de foto is geregeld',
      description:
        'Aanvinken zodra de exposant of fotograaf akkoord is met publicatie. Verplicht bij een foto.',
      type: 'boolean',
      initialValue: false,
      hidden: ({ document }) => !document?.foto,
      validation: (Rule) =>
        Rule.custom((value, context) => {
          const doc = context.document as { foto?: unknown } | undefined;
          if (doc?.foto && value !== true) {
            return 'Zonder toestemming mag de foto niet gepubliceerd worden.';
          }
          return true;
        }),
    }),
  ],
  orderings: [
    {
      title: 'Datum, eerstvolgende bovenaan',
      name: 'startAsc',
      by: [{ field: 'start', direction: 'asc' }],
    },
  ],
  preview: {
    select: { title: 'interneTitel', start: 'start', zichtbaarheid: 'zichtbaarheid', media: 'foto' },
    prepare({ title, start, zichtbaarheid, media }) {
      const labels: Record<string, string> = {
        publiek: 'Publiek',
        bezet: 'Alleen bezet',
        verborgen: 'Verborgen',
      };
      const datum = start
        ? new Date(start).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
        : 'geen datum';
      return { title, subtitle: `${datum} — ${labels[zichtbaarheid] ?? zichtbaarheid}`, media };
    },
  },
});
