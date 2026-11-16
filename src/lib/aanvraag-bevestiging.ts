/**
 * Ontvangstbevestiging na een opgeslagen verhuuraanvraag.
 * Los van de bestuursmail. Alleen Aan verstuurt. Test en Uit schrijven geen productieregel.
 */

import type { Aanvraag } from './validatie.ts';
import { SOORTEN } from './validatie.ts';
import { leesbareDatum, samenstellenWorkflowmail } from '../platform/mail-poort.ts';
import { standaardTemplate } from '../platform/mailtemplates/catalog.ts';
import { legVerzendingVast } from './communicatie-log.ts';
import { VAN_ADRES, CONTRACTBEHEER_EMAIL } from './mail-adressen.ts';

function datumLabel(waarden: Aanvraag): string {
  const van = leesbareDatum(waarden.datum);
  if (!waarden.datumTot || waarden.datumTot === waarden.datum) return van;
  return `${van} tot ${leesbareDatum(waarden.datumTot)}`;
}

export async function verstuurAanvraagbevestiging(waarden: Aanvraag, aanvraagId?: number): Promise<void> {
  try {
    const { besluitVoor } = await import('./automatisering-register.ts');
    const { verstuurGecontroleerd } = await import('./mail-transport.ts');
    const besluit = await besluitVoor('aanvraag_bevestiging');
    if (besluit.modus !== 'aan') return;
    const template = standaardTemplate('booking_request_received');
    if (!template) return;
    const soort = SOORTEN.find((item) => item.waarde === waarden.soort)?.label ?? waarden.soort;
    const mail = samenstellenWorkflowmail(template, {
      naam: waarden.naam,
      email: waarden.email,
      telefoon: waarden.telefoon,
      soort,
      start: waarden.datum,
      eind: waarden.datumTot || waarden.datum,
      datumLabel: datumLabel(waarden),
    }, { templateId: template.id });
    if (!mail.ok) {
      console.error('[aanvraag] bevestiging niet verzonden', mail.toelichting);
      return;
    }
    const dedup = `aanvraag-bevestiging:${aanvraagId ?? waarden.email}:${waarden.datum}`;
    const uit = await verstuurGecontroleerd(
      {
        sleutel: 'aanvraag_bevestiging',
        naar: waarden.email,
        onderwerp: mail.onderwerp,
        tekst: mail.tekst,
        html: mail.html,
        templateId: template.id,
        richting: 'aanvrager',
        modus: besluit.modus,
        idempotentieSleutel: dedup,
      },
      { modus: besluit.modus },
    );
    if (!uit.providerAangeroepen) return;
    await legVerzendingVast({
      aanvraagId: aanvraagId ? String(aanvraagId) : null,
      templateSleutel: 'booking_request_received',
      onderwerp: mail.onderwerp,
      bedoeldeOntvanger: waarden.email,
      werkelijkeOntvanger: uit.werkelijkeOntvanger || '',
      afzender: VAN_ADRES,
      replyTo: CONTRACTBEHEER_EMAIL,
      richting: 'uitgaand',
      status: 'verzonden',
      providerBerichtId: uit.providerBerichtId,
      foutmelding: 'Geaccepteerd door de e-mailprovider. Aflevering is niet bevestigd.',
      test: false,
      dedupSleutel: dedup,
    });
  } catch (error) {
    console.error('[aanvraag] bevestiging niet verzonden', error);
  }
}
