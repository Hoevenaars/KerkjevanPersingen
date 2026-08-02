import { defineType, defineField } from 'sanity';

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
  ],
  preview: {
    prepare: () => ({ title: 'Instellingen', subtitle: 'E-mailadres voor aanvragen' }),
  },
});
