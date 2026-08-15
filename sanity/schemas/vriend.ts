export default {
  name: 'vriend',
  title: 'Vriend van het kerkje',
  type: 'document',
  fields: [
    {
      name: 'naam',
      title: 'Naam',
      type: 'string',
    },
    {
      name: 'email',
      title: 'E-mailadres',
      type: 'string',
      validation: (Rule: any) => Rule.required().email(),
    },
    {
      name: 'actief',
      title: 'Actief (ontvangt mailing)',
      type: 'boolean',
      initialValue: true,
      description: 'Zet uit om iemand tijdelijk te pauzeren zonder te verwijderen.',
    },
    {
      name: 'uitschrijfToken',
      title: 'Uitschrijftoken',
      type: 'string',
      readOnly: true,
      description: 'Automatisch gegenereerd bij aanmelding, gebruikt in de afmeldlink.',
    },
    {
      name: 'aangemeldOp',
      title: 'Aangemeld op',
      type: 'datetime',
      readOnly: true,
    },
  ],
  preview: {
    select: { title: 'naam', subtitle: 'email' },
  },
}
