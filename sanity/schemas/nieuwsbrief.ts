export default {
  name: 'nieuwsbrief',
  title: 'Wekelijkse nieuwsbrief',
  type: 'document',
  fields: [
    {
      name: 'week',
      title: 'Week van (maandag)',
      type: 'date',
      description: 'De cron gebruikt dit veld om de juiste week te vinden. Zet op de maandag van de betreffende week.',
    },
    {
      name: 'kortNieuws',
      title: 'Kort nieuws (optioneel)',
      type: 'text',
      rows: 3,
      description: 'Leeg laten = geen "kort nieuws"-blok in de mail deze week.',
    },
    {
      name: 'donatieUpdate',
      title: 'Donatie-update (optioneel)',
      type: 'text',
      rows: 3,
      description: 'Leeg laten = geen donatie-blok deze week.',
    },
    {
      name: 'geannuleerd',
      title: 'Deze week niet versturen',
      type: 'boolean',
      initialValue: false,
      description: 'Zet aan om verzending voor deze week volledig te blokkeren.',
    },
    {
      name: 'verstuurd',
      title: 'Verstuurd',
      type: 'boolean',
      initialValue: false,
      readOnly: true,
      description: 'Wordt automatisch gezet door het systeem. Niet handmatig aanpassen.',
    },
  ],
  preview: {
    select: { title: 'week', verstuurd: 'verstuurd' },
    prepare({ title, verstuurd }: any) {
      return {
        title: title ?? 'Geen week ingesteld',
        subtitle: verstuurd ? 'Verstuurd' : 'Nog niet verstuurd',
      }
    },
  },
}
