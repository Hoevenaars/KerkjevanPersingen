import { defineField, defineType } from 'sanity';

function maandagVanDezeWeek(): string {
  const ymd = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' });
  const [jaar, maand, dag] = ymd.split('-').map(Number);
  const utcMiddag = new Date(Date.UTC(jaar, maand - 1, dag, 12, 0, 0));
  const weekdag = utcMiddag.getUTCDay();
  utcMiddag.setUTCDate(utcMiddag.getUTCDate() + (weekdag === 0 ? -6 : 1 - weekdag));
  return utcMiddag.toISOString().slice(0, 10);
}

/**
 * Wekelijkse inhoud voor de vriendenmail. Lege optionele velden blijven weg
 * in de mail. Zonder document voor een week stuurt de cron tóch de agenda,
 * en maakt zelf een statusdocument aan zodat niet dubbel verstuurd wordt.
 */
export const nieuwsbrief = defineType({
  name: 'nieuwsbrief',
  title: 'Wekelijkse nieuwsbrief',
  type: 'document',
  fields: [
    defineField({
      name: 'week',
      title: 'Week van (maandag)',
      type: 'date',
      initialValue: maandagVanDezeWeek,
      description:
        'De cron zoekt op de maandag van de week. Donderdag gaat er een concept naar Nick; vrijdagochtend gaat de mail naar alle actieve vrienden.',
      validation: (Rule) =>
        Rule.required().custom((week) => {
          if (!week) return true;
          const d = new Date(`${week}T12:00:00Z`);
          return d.getUTCDay() === 1
            ? true
            : 'Kies een maandag. De verzending zoekt op de maandag van de week.';
        }),
    }),
    defineField({
      name: 'kortNieuws',
      title: 'Kort nieuws (optioneel)',
      type: 'text',
      rows: 3,
      description: 'Leeg laten = geen "kort nieuws"-blok in de mail deze week.',
    }),
    defineField({
      name: 'kortNieuwsFoto',
      title: 'Foto bij kort nieuws (optioneel)',
      type: 'image',
      options: {hotspot: true},
      description: 'Alleen in de mail, niet op de website. Leeg laten = alleen tekst.',
    }),
    defineField({
      name: 'kortNieuwsFotoAlt',
      title: 'Beschrijving van die foto',
      type: 'string',
      hidden: ({document}) => !document?.kortNieuwsFoto,
      description: 'Kort wat er op de foto staat, voor wie de afbeelding niet ziet.',
    }),
    defineField({
      name: 'donatieUpdate',
      title: 'Donatie-update (optioneel)',
      type: 'text',
      rows: 3,
      description: 'Leeg laten = geen donatie-blok deze week.',
    }),
    defineField({
      name: 'geannuleerd',
      title: 'Deze week niet versturen',
      type: 'boolean',
      initialValue: false,
      description: 'Zet aan om verzending voor deze week volledig te blokkeren.',
    }),
    defineField({
      name: 'verstuurd',
      title: 'Verstuurd',
      type: 'boolean',
      initialValue: false,
      readOnly: true,
      description: 'Wordt automatisch gezet door het systeem. Niet handmatig aanpassen.',
    }),
  ],
  orderings: [
    {
      title: 'Week, nieuwste eerst',
      name: 'weekDesc',
      by: [{ field: 'week', direction: 'desc' }],
    },
  ],
  preview: {
    select: { title: 'week', verstuurd: 'verstuurd', geannuleerd: 'geannuleerd' },
    prepare({ title, verstuurd, geannuleerd }) {
      let status = 'Nog niet verstuurd';
      if (geannuleerd) status = 'Geannuleerd';
      else if (verstuurd) status = 'Verstuurd';
      return {
        title: title ? `Week van ${title}` : 'Geen week ingesteld',
        subtitle: status,
      };
    },
  },
});
