import { defineField, defineType } from 'sanity';

/**
 * Eén adresboek voor iedereen die het kerkje iets aangaat, behalve de
 * vriendenmail (dat blijft `vriend`).
 *
 * Rollen mogen stapelen: iemand kan exposant én gastheer zijn. De reservelijst
 * is een vinkje, geen apart document — bij een annulering kan later één query
 * alle aangevinkte exposanten mailen, plus wie al eens geëxposeerd heeft.
 */
export const persoon = defineType({
  name: 'persoon',
  title: 'Persoon',
  type: 'document',
  fields: [
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
      name: 'rollen',
      title: 'Rollen',
      type: 'array',
      of: [{ type: 'string' }],
      options: {
        list: [
          { title: 'Exposant / huurder', value: 'huurder' },
          { title: 'Gastheer of gastvrouw', value: 'gastheer' },
          { title: 'Bestuur / contactpersoon', value: 'bestuur' },
        ],
        layout: 'grid',
      },
    }),
    defineField({
      name: 'opReservelijst',
      title: 'Op de reservelijst voor exposities',
      description:
        'Krijgt later automatisch bericht als een expositie-weekend vrijkomt. Zet dit aan bij mensen die dat willen, of bij eerdere exposanten die je opnieuw wilt benaderen.',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'notities',
      title: 'Interne notities',
      type: 'text',
      rows: 3,
    }),
  ],
  orderings: [
    {
      title: 'Naam A–Z',
      name: 'naamAsc',
      by: [{ field: 'naam', direction: 'asc' }],
    },
  ],
  preview: {
    select: { title: 'naam', email: 'email', reservelijst: 'opReservelijst' },
    prepare({ title, email, reservelijst }) {
      return {
        title,
        subtitle: reservelijst ? `${email ?? ''} · reservelijst` : email,
      };
    },
  },
});
