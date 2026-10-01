/**
 * Enige plek die een mailprovider mag aanroepen.
 * Uit, test en onbekend doen geen provider-call en markeren niets als verzonden.
 */

import { besluitVoor } from './automatisering-register.ts';
import { MailGeblokkeerd, type Automatisering, type Verzendbesluit } from '../platform/automatisering.ts';

export interface MailBericht {
  sleutel: string;
  naar: string;
  onderwerp: string;
  tekst: string;
  html?: string;
}

export interface MailTransport {
  verstuur(bericht: MailBericht): Promise<void>;
}

export interface TransportUitkomst {
  verzonden: boolean;
  providerAangeroepen: boolean;
  besluit: Verzendbesluit;
}

export async function verstuurGecontroleerd(
  bericht: MailBericht,
  opties: {
    register?: readonly Automatisering[];
    transport?: MailTransport;
  } = {},
): Promise<TransportUitkomst> {
  const besluit = await besluitVoor(bericht.sleutel, opties.register);
  if (!besluit.provider) {
    return { verzonden: false, providerAangeroepen: false, besluit };
  }
  const transport = opties.transport ?? resendTransport();
  await transport.verstuur(bericht);
  return { verzonden: true, providerAangeroepen: true, besluit };
}

export async function eisProviderToegestaan(
  sleutel: string,
  register?: readonly Automatisering[],
  env?: Record<string, unknown>,
): Promise<Verzendbesluit> {
  const besluit = await besluitVoor(sleutel, register, env);
  if (!besluit.provider) throw new MailGeblokkeerd(besluit.reden);
  return besluit;
}

function resendTransport(): MailTransport {
  return {
    async verstuur(bericht) {
      const apiKey = process.env.RESEND_API_KEY?.trim();
      if (!apiKey) throw new MailGeblokkeerd('RESEND_API_KEY ontbreekt');
      const { Resend } = await import('resend');
      const resend = new Resend(apiKey);
      const from = process.env.CONTACT_FALLBACK_EMAIL?.trim() || 'Het Kerkje van Persingen <noreply@send.kerkjepersingen.nl>';
      const { error } = await resend.emails.send({
        from,
        to: [bericht.naar],
        subject: bericht.onderwerp,
        text: bericht.tekst,
        html: bericht.html,
      });
      if (error) throw new Error(error.message);
    },
  };
}
