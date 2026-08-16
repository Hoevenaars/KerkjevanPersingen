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
 *
 * "Vergadering" is bewust geen optie meer — het bestuur wil dit type verhuur niet
 * aanbieden. Bestaande data met die waarde (indien aanwezig) blijft geldig, maar
 * kan niet meer opnieuw gekozen worden.
 *
 * "toonVanafMaanden": zonder waarde is een publieke activiteit direct zichtbaar
 * zodra hij op "publiek" staat. Met een waarde verschijnt hij pas op de site vanaf
 * dat aantal maanden vóór de startdatum — handig als het bestuur een expositie ver
 * van tevoren al wil vastleggen zonder dat bezoekers hem meteen zien.
 */
export const activiteit = defineType({
  name: 'activiteit',
  title: 'Activiteit of boeking',
  type: 'document',
  fieldsets: [
    {
      name: 'boeking',
      title: 'Huurder en boekingsstatus (voorbereiding)',
      options: { collapsible: true, collapsed: true },
    },
    {
      name: 'websiteContent',
      title: 'Aangeleverde website-content (voorbereiding)',
      options: { collapsible: true, collapsed: true },
    },
    {
      name: 'automatisering',
      title: 'Automatische mails — alleen status, niet handmatig vullen',
      options: { collapsible: true, collapsed: true },
    },
  ],
  fields: [
    defineField({
      name: 'interneTitel',
      title: 'Interne titel',
      description: 'Voor jullie eigen administratie. Komt nooit op de website.',
      type: 'string',
      validation: (Rule) => Rule.required().min(2),
    }),
    defineField({
      name: 'huurderEmail',
      title: 'E-mailadres huurder',
      description:
        'Hierheen gaan later de voorbereidingsmails (tekst/foto, praktische info, herinnering) en het verzoek om een Google-review. Komt niet op de website. Bij een blokkade leeg laten.',
      type: 'string',
      hidden: ({ document }) => document?.soort === 'blokkade',
      validation: (Rule) =>
        Rule.email().warning('Dit lijkt geen geldig e-mailadres. De automatische mails komen dan niet aan.'),
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
          { title: 'Expositie', value: 'expositie' },
          { title: 'Bruiloft', value: 'bruiloft' },
          { title: 'Concert', value: 'concert' },
          { title: 'Viering of dienst', value: 'viering' },
          { title: 'Diverse bijeenkomsten', value: 'diverse' },
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
      name: 'toonVanafMaanden',
      title: 'Pas tonen op de website vanaf',
      description:
        'Optioneel. Laat leeg om direct te tonen zodra dit op "publiek" staat. Kies een aantal maanden om pas dichter bij de datum zelf zichtbaar te worden.',
      type: 'string',
      hidden: ({ document }) => document?.zichtbaarheid !== 'publiek',
      options: {
        list: [
          { title: 'Altijd direct tonen', value: '' },
          { title: '3 maanden van tevoren', value: '3' },
          { title: '6 maanden van tevoren', value: '6' },
          { title: '9 maanden van tevoren', value: '9' },
          { title: '12 maanden van tevoren', value: '12' },
        ],
        layout: 'dropdown',
      },
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
    defineField({
      name: 'boekingStatus',
      title: 'Boekingsstatus',
      description:
        'Los van wat er op de website staat. "Optie" = ja gezegd, wacht op aanbetaling. "Definitief" = Paul heeft ja gezegd. Bestaande boekingen blijven "Handmatig vastgelegd".',
      type: 'string',
      initialValue: 'vastgelegd',
      fieldset: 'boeking',
      options: {
        list: [
          { title: 'Handmatig vastgelegd (huidige werkwijze)', value: 'vastgelegd' },
          { title: 'Optie — contract uit, wacht op aanbetaling', value: 'optie' },
          { title: 'Definitief — aanbetaling binnen', value: 'definitief' },
          { title: 'Geannuleerd — daarna zichtbaarheid op verborgen zetten', value: 'geannuleerd' },
        ],
        layout: 'radio',
      },
    }),
    defineField({
      name: 'huurder',
      title: 'Huurder in het adresboek (optioneel)',
      description:
        'Niet nodig als het e-mailadres hierboven al is ingevuld. Handig als dezelfde exposant vaker terugkomt of op de reservelijst staat.',
      type: 'reference',
      to: [{ type: 'persoon' }],
      fieldset: 'boeking',
    }),
    defineField({
      name: 'aanvraag',
      title: 'Bijbehorende aanvraag',
      type: 'reference',
      to: [{ type: 'aanvraag' }],
      fieldset: 'boeking',
    }),
    defineField({
      name: 'tariefBedrag',
      title: 'Afgesproken tarief (€)',
      description: 'Momentopname bij het contract, zodat een latere tariefwijziging oude boekingen niet verandert.',
      type: 'number',
      fieldset: 'boeking',
    }),
    defineField({
      name: 'aanbetalingBinnen',
      title: 'Aanbetaling binnen',
      type: 'boolean',
      initialValue: false,
      fieldset: 'boeking',
    }),
    defineField({
      name: 'gastheer',
      title: 'Gastheer of gastvrouw die dienst heeft',
      type: 'reference',
      to: [{ type: 'persoon' }],
      fieldset: 'boeking',
    }),
    defineField({
      name: 'contactpersoonBestuur',
      title: 'Contactpersoon vanuit het bestuur',
      type: 'reference',
      to: [{ type: 'persoon' }],
      fieldset: 'boeking',
    }),
    defineField({
      name: 'contentStatus',
      title: 'Status website-content',
      description:
        'Later: bij "goedgekeurd" verschijnt tekst/foto automatisch op de site. Nu nog geen effect op de website.',
      type: 'string',
      initialValue: 'ontbreekt',
      fieldset: 'websiteContent',
      options: {
        list: [
          { title: 'Nog niet binnen', value: 'ontbreekt' },
          { title: 'Gevraagd bij de huurder', value: 'gevraagd' },
          { title: 'Ontvangen — ter beoordeling', value: 'ontvangen' },
          { title: 'Goedgekeurd', value: 'goedgekeurd' },
          { title: 'Afgewezen — opnieuw aanleveren', value: 'afgewezen' },
        ],
      },
    }),
    defineField({
      name: 'aangeleverdeTekst',
      title: 'Aangeleverde tekst (concept)',
      description: 'Nog niet wat bezoekers zien. Publieke tekst blijft het veld Omschrijving hierboven.',
      type: 'text',
      rows: 4,
      fieldset: 'websiteContent',
    }),
    defineField({
      name: 'aangeleverdeFoto',
      title: 'Aangeleverde foto (concept)',
      type: 'image',
      options: { hotspot: true },
      fieldset: 'websiteContent',
    }),
    defineField({
      name: 'mailContentVerzoekOp',
      title: 'Content-verzoek verstuurd op',
      type: 'datetime',
      readOnly: true,
      fieldset: 'automatisering',
    }),
    defineField({
      name: 'mailAanbetalingCheckOp',
      title: 'Aanbetaling-check naar Paul verstuurd op',
      type: 'datetime',
      readOnly: true,
      fieldset: 'automatisering',
    }),
    defineField({
      name: 'mailPraktisch4wOp',
      title: 'Praktische mail (4 weken) verstuurd op',
      type: 'datetime',
      readOnly: true,
      fieldset: 'automatisering',
    }),
    defineField({
      name: 'mailHerinnering1dOp',
      title: 'Herinnering (1 dag) verstuurd op',
      type: 'datetime',
      readOnly: true,
      fieldset: 'automatisering',
    }),
    defineField({
      name: 'mailReviewOp',
      title: 'Review-verzoek verstuurd op',
      type: 'datetime',
      readOnly: true,
      fieldset: 'automatisering',
    }),
    defineField({
      name: 'mailReservelijstOp',
      title: 'Reservelijst aangeschreven op',
      type: 'datetime',
      readOnly: true,
      fieldset: 'automatisering',
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
    select: {
      title: 'interneTitel',
      start: 'start',
      zichtbaarheid: 'zichtbaarheid',
      boekingStatus: 'boekingStatus',
      media: 'foto',
    },
    prepare({ title, start, zichtbaarheid, boekingStatus, media }) {
      const labels: Record<string, string> = {
        publiek: 'Publiek',
        bezet: 'Alleen bezet',
        verborgen: 'Verborgen',
      };
      const statusLabels: Record<string, string> = {
        optie: 'optie',
        definitief: 'definitief',
        geannuleerd: 'geannuleerd',
      };
      const datum = start
        ? new Date(start).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
        : 'geen datum';
      const extra = statusLabels[boekingStatus] ? ` · ${statusLabels[boekingStatus]}` : '';
      return {
        title,
        subtitle: `${datum} — ${labels[zichtbaarheid] ?? zichtbaarheid}${extra}`,
        media,
      };
    },
  },
});
