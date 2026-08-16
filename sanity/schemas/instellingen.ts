import { defineType, defineField } from 'sanity';
import { MAILTEKSTEN } from './mailteksten';

/**
 * Losse instellingen, bewust gescheiden van de activiteiten.
 *
 * Reden: dit veld mag niet per ongeluk leeggemaakt worden tijdens het invoeren van een
 * concert. Het staat daarom in een eigen document met een eigen plek in het menu.
 * De validatie hieronder vangt een typefout af; de fallback in de omgevingsvariabelen
 * en de vaste BCC vangen de rest af.
 */
export const instellingen = defineType({
  name: 'instellingen',
  title: 'Instellingen',
  type: 'document',
  // Eén enkel document, niet dupliceerbaar.
  __experimental_actions: ['update', 'publish'],
  fieldsets: [
    {
      name: 'boekingsproces',
      title: 'Boekingsproces (voorbereiding, nog niet live)',
      options: { collapsible: true, collapsed: true },
    },
    {
      name: 'mailteksten',
      title: 'Mailteksten (voorbereiding, nog niet live)',
      options: { collapsible: true, collapsed: true },
    },
  ],
  fields: [
    defineField({
      name: 'ontvangstAdres',
      title: 'E-mailadres voor aanvragen',
      description:
        'Hier komen alle verhuuraanvragen binnen. Controleer goed voor je opslaat — een typefout betekent dat aanvragen niet aankomen.',
      type: 'string',
      validation: (Rule) =>
        Rule.required()
          .email()
          .error('Vul een geldig e-mailadres in, bijvoorbeeld naam@voorbeeld.nl'),
    }),
    defineField({
      name: 'extraOntvangstAdres',
      title: 'Extra ontvangstadres (optioneel)',
      description:
        'Optioneel: een tweede vast e-mailadres dat elke aanvraag ook ontvangt, naast het adres hierboven. Laat leeg als niemand anders standaard mee moet lezen.',
      type: 'string',
      validation: (Rule) =>
        Rule.custom((value) => {
          if (!value) return true;
          const geldig = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
          return geldig ? true : 'Vul een geldig e-mailadres in, of laat dit veld leeg.';
        }),
    }),
    defineField({
      name: 'penningmeesterAdres',
      title: 'E-mailadres penningmeester (Paul)',
      description:
        'Later: hier komt de vraag "is de aanbetaling binnen?". Nog niet in gebruik.',
      type: 'string',
      fieldset: 'boekingsproces',
      validation: (Rule) =>
        Rule.custom((value) => {
          if (!value) return true;
          const geldig = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
          return geldig ? true : 'Vul een geldig e-mailadres in, of laat dit veld leeg.';
        }),
    }),
    defineField({
      name: 'aanbetalingTermijnDagen',
      title: 'Aanbetaling controleren na (dagen)',
      description: 'Na goedkeuring wacht het systeem dit aantal dagen tot de check naar Paul. Nog niet in gebruik.',
      type: 'number',
      initialValue: 14,
      fieldset: 'boekingsproces',
      validation: (Rule) => Rule.min(1).max(120),
    }),
    defineField({
      name: 'contentVerzoekMaandenVooraf',
      title: 'Content vragen (maanden van tevoren)',
      description: 'Mail naar de huurder om tekst/foto voor de website. Nog niet in gebruik.',
      type: 'number',
      initialValue: 4,
      fieldset: 'boekingsproces',
      validation: (Rule) => Rule.min(1).max(12),
    }),
    defineField({
      name: 'googleReviewUrl',
      title: 'Link naar Google-review',
      description: 'Komt later in de mail na afloop. Nog niet in gebruik.',
      type: 'url',
      fieldset: 'boekingsproces',
    }),
    defineField({
      name: 'tarieven',
      title: 'Tarieven',
      description:
        'Bron voor het latere contract. Bedragen in euro’s, zonder euroteken. Leeg bedrag = op aanvraag.',
      type: 'array',
      fieldset: 'boekingsproces',
      of: [
        {
          type: 'object',
          fields: [
            defineField({
              name: 'soort',
              title: 'Soort',
              type: 'string',
              options: {
                list: [
                  { title: 'Expositie', value: 'expositie' },
                  { title: 'Bruiloft', value: 'bruiloft' },
                  { title: 'Concert', value: 'concert' },
                  { title: 'Diverse bijeenkomsten', value: 'diverse' },
                ],
              },
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'bedrag',
              title: 'Bedrag nu (€)',
              type: 'number',
            }),
            defineField({
              name: 'bedragVanaf2029',
              title: 'Bedrag vanaf 2029 (€)',
              type: 'number',
            }),
            defineField({
              name: 'toelichting',
              title: 'Toelichting',
              type: 'string',
              description: 'Bijv. "op aanvraag" of "vanaf".',
            }),
          ],
          preview: {
            select: { soort: 'soort', bedrag: 'bedrag', toelichting: 'toelichting' },
            prepare({ soort, bedrag, toelichting }) {
              const prijs = bedrag != null ? `€ ${bedrag}` : toelichting || 'op aanvraag';
              return { title: soort, subtitle: prijs };
            },
          },
        },
      ],
      initialValue: [
        { soort: 'expositie', bedrag: 490, bedragVanaf2029: 525 },
        { soort: 'bruiloft', bedrag: 550, bedragVanaf2029: 590 },
        { soort: 'concert', toelichting: 'Op aanvraag' },
        { soort: 'diverse', bedrag: 250, bedragVanaf2029: 275, toelichting: 'vanaf' },
      ],
    }),
    defineField({
      name: 'contractTekst',
      title: 'Contracttekst (sjabloon)',
      description:
        'Voorzet. Bindend blijft Nellekes officiële contract. Plaatshouders: {naam}, {datum}, {soort}, {tarief}.',
      type: 'text',
      rows: 14,
      fieldset: 'mailteksten',
      initialValue: MAILTEKSTEN.contractSjabloon,
    }),
    defineField({
      name: 'mailAfwijzing',
      title: 'Mail: aanvraag afgewezen',
      type: 'text',
      rows: 8,
      fieldset: 'mailteksten',
      initialValue: MAILTEKSTEN.afwijzing,
    }),
    defineField({
      name: 'mailContractBegeleiding',
      title: 'Mail: contract meesturen',
      type: 'text',
      rows: 8,
      fieldset: 'mailteksten',
      initialValue: MAILTEKSTEN.contractBegeleiding,
    }),
    defineField({
      name: 'mailVolgendeStappen',
      title: 'Mail: volgende stappen na definitieve boeking',
      type: 'text',
      rows: 8,
      fieldset: 'mailteksten',
      initialValue: MAILTEKSTEN.volgendeStappen,
    }),
    defineField({
      name: 'mailAanbetalingCheckPaul',
      title: 'Mail: aanbetaling-check naar Paul',
      description: 'Intern. De huurder ziet deze mail niet.',
      type: 'text',
      rows: 8,
      fieldset: 'mailteksten',
      initialValue: MAILTEKSTEN.aanbetalingCheckPaul,
    }),
    defineField({
      name: 'mailContentVerzoek',
      title: 'Mail: tekst/foto aanleveren',
      type: 'text',
      rows: 8,
      fieldset: 'mailteksten',
      initialValue: MAILTEKSTEN.contentVerzoek,
    }),
    defineField({
      name: 'mailContentTerBeoordeling',
      title: 'Mail: content ter beoordeling (bestuur)',
      description: 'Intern.',
      type: 'text',
      rows: 6,
      fieldset: 'mailteksten',
      initialValue: MAILTEKSTEN.contentTerBeoordeling,
    }),
    defineField({
      name: 'mailPraktisch4w',
      title: 'Mail: praktische info (4 weken, huurder)',
      type: 'text',
      rows: 12,
      fieldset: 'mailteksten',
      initialValue: MAILTEKSTEN.praktisch4w,
    }),
    defineField({
      name: 'mailPraktischGastheer',
      title: 'Mail: praktische info (4 weken, gastheer)',
      type: 'text',
      rows: 8,
      fieldset: 'mailteksten',
      initialValue: MAILTEKSTEN.praktischGastheer,
    }),
    defineField({
      name: 'mailHerinnering1d',
      title: 'Mail: herinnering 1 dag (huurder)',
      type: 'text',
      rows: 8,
      fieldset: 'mailteksten',
      initialValue: MAILTEKSTEN.herinnering1d,
    }),
    defineField({
      name: 'mailHerinneringGastheer',
      title: 'Mail: herinnering 1 dag (gastheer)',
      type: 'text',
      rows: 6,
      fieldset: 'mailteksten',
      initialValue: MAILTEKSTEN.herinneringGastheer,
    }),
    defineField({
      name: 'mailReviewVerzoek',
      title: 'Mail: Google-review na afloop',
      type: 'text',
      rows: 7,
      fieldset: 'mailteksten',
      initialValue: MAILTEKSTEN.reviewVerzoek,
    }),
    defineField({
      name: 'mailReservelijst',
      title: 'Mail: vrijgekomen weekend (reservelijst)',
      type: 'text',
      rows: 8,
      fieldset: 'mailteksten',
      initialValue: MAILTEKSTEN.reservelijst,
    }),
  ],
  preview: {
    prepare: () => ({ title: 'Instellingen', subtitle: 'E-mail, tarieven en mailteksten' }),
  },
});
