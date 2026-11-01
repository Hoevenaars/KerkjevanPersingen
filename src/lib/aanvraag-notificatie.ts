/**
 * Interne mail na een opgeslagen aanvraag.
 * Versturen gaat via de bestaande Resend-route. De service-role leest alleen
 * het privé-instellingenadres en verstuurt zelf geen mail.
 */

import type { Aanvraag } from './validatie.ts';
import { leesExtraAanvraagOntvanger, ontvangersZonderBcc, uniekeOntvangers } from './aanvraag-ontvangers.ts';
import { toezichtBcc } from './toezicht-bcc.ts';

export async function verstuurInterneAanvraagMails(waarden: Aanvraag, aanvraagId?: number): Promise<void> {
  const { sendInterneAanvraagMail } = await import('./mail-transport.ts');
  const { bestuurMail } = await import('./aanvraag.ts');
  const { legVerzendingVast } = await import('./communicatie-log.ts');
  const { VAN_ADRES } = await import('./mail-adressen.ts');
  const brief = bestuurMail(waarden);
  const primair = process.env.CONTACT_FALLBACK_EMAIL?.trim() || 'contractbeheer.kvp@gmail.com';
  const extra = await leesExtraAanvraagOntvanger();
  const bcc = await toezichtBcc(primair, process.env, true).catch(() => [] as string[]);
  const ontvangers = ontvangersZonderBcc(uniekeOntvangers([primair, extra]), bcc);
  for (const bedoelde of ontvangers) {
    let verstuurd = false;
    try {
      const mail = await sendInterneAanvraagMail({
        sleutel: 'aanvraag_bestuur',
        to: bedoelde,
        subject: 'Nieuwe verhuuraanvraag',
        text: brief.text,
        html: brief.html,
        aanvragerEmail: waarden.email,
        aanvragerNaam: waarden.naam,
      });
      verstuurd = mail.providerAangeroepen;
      if (verstuurd || mail.geblokkeerd) {
        await legVerzendingVast({
          aanvraagId: aanvraagId ? String(aanvraagId) : null,
          templateSleutel: 'internal_booking_review_required',
          onderwerp: 'Nieuwe verhuuraanvraag',
          bedoeldeOntvanger: bedoelde,
          werkelijkeOntvanger: mail.werkelijkeOntvanger || '',
          afzender: VAN_ADRES,
          replyTo: waarden.email,
          richting: 'uitgaand',
          status: verstuurd ? 'verzonden' : 'geblokkeerd',
          providerBerichtId: mail.providerBerichtId,
          foutmelding: verstuurd ? null : mail.melding || mail.besluit.reden,
          test: mail.besluit.modus === 'test',
          dedupSleutel: `aanvraag-bestuur:${aanvraagId ?? waarden.email}:${waarden.datum}:${bedoelde}`,
        });
      }
    } catch (error) {
      if (!verstuurd) console.error('[aanvraag] bestuursnotificatie niet verzonden', error);
      else console.error('[aanvraag] verzendregel niet opgeslagen, mail niet opnieuw verstuurd', error);
    }
  }
}
