import {defineField, defineType} from 'sanity'
import {isWebmaster} from '../lib/rollen'

/**
 * Ontvanger van de wekelijkse "Vrienden van het kerkje"-mail.
 *
 * Aanmelden gebeurt via /vrienden/aanmelden; uitschrijven via een persoonlijke
 * tokenlink. Alleen de webmaster ziet deze lijst in Studio (AVG). Het bestuur
 * kan iemand hier ook handmatig pauzeren (actief uit) zonder te verwijderen.
 */
export const vriend = defineType({
  name: 'vriend',
  title: 'Vriend van het kerkje',
  type: 'document',
  hidden: ({currentUser}) => !isWebmaster(currentUser),
  // Niet in globaal zoeken: anders ziet een Editor namen/e-mail via de zoekbalk.
  __experimental_omnisearch_visibility: false,
  fields: [
    defineField({
      name: 'naam',
      title: 'Naam',
      type: 'string',
    }),
    defineField({
      name: 'email',
      title: 'E-mailadres',
      type: 'string',
      validation: (Rule) => Rule.required().email(),
    }),
    defineField({
      name: 'actief',
      title: 'Actief (ontvangt mailing)',
      type: 'boolean',
      initialValue: true,
      description: 'Zet uit om iemand tijdelijk te pauzeren zonder te verwijderen.',
    }),
    defineField({
      name: 'frequentie',
      title: 'Frequentie',
      type: 'string',
      initialValue: 'wekelijks',
      options: {
        list: [
          { title: 'Elke week', value: 'wekelijks' },
          { title: 'Elke twee weken', value: 'tweewekelijks' },
          { title: 'Eens per maand', value: 'maandelijks' },
        ],
        layout: 'radio',
      },
      description: 'Hoe vaak iemand de nieuwsbrief ontvangt. Alleen actieve vrienden krijgen mail.',
    }),
    defineField({
      name: 'uitschrijfToken',
      title: 'Uitschrijftoken',
      type: 'string',
      readOnly: true,
      hidden: true,
      initialValue: () => crypto.randomUUID(),
      description: 'Automatisch gegenereerd bij aanmelding, gebruikt in de afmeldlink.',
    }),
    defineField({
      name: 'aangemeldOp',
      title: 'Aangemeld op',
      type: 'datetime',
      readOnly: true,
      initialValue: () => new Date().toISOString(),
    }),
  ],
  orderings: [
    {
      title: 'Recent aangemeld',
      name: 'aangemeldOpDesc',
      by: [{ field: 'aangemeldOp', direction: 'desc' }],
    },
    {
      title: 'E-mail A–Z',
      name: 'emailAsc',
      by: [{ field: 'email', direction: 'asc' }],
    },
  ],
  preview: {
    select: { title: 'naam', email: 'email', actief: 'actief', frequentie: 'frequentie' },
    prepare({ title, email, actief, frequentie }) {
      const freq =
        frequentie === 'tweewekelijks'
          ? ' · 2-wekelijks'
          : frequentie === 'maandelijks'
            ? ' · maandelijks'
            : '';
      return {
        title: title || email || 'Naamloos',
        subtitle: actief === false ? `${email ?? ''} (gepauzeerd)${freq}` : `${email ?? ''}${freq}`,
      };
    },
  },
});
