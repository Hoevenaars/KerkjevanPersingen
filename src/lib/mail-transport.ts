/**
 * Enige plek die een mailprovider mag aanroepen.
 * Uit, test en onbekend doen geen provider-call en markeren niets als verzonden.
 */

import { besluitVoor } from './automatisering-register.ts';
import { MailGeblokkeerd, type Automatisering, type Verzendbesluit } from '../platform/automatisering.ts';
import { VAN_ADRES, replyToVoor } from './mail-adressen.ts';
import { isInterneKerkjeSleutel, toezichtBcc } from './toezicht-bcc.ts';

export interface MailBericht {
  sleutel: string;
  naar: string;
  onderwerp: string;
  tekst: string;
  html?: string;
  /** Expliciet Reply-To. Bij een interne aanvraagnotificatie is dit het adres van de aanvrager. */
  replyTo?: string;
  aanvragerEmail?: string;
  templateId?: string;
}

export interface ResendInhoud {
  from: string;
  to: string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo: string;
  bcc?: string[];
  headers?: Record<string, string>;
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

export function bouwResendInhoud(input: {
  naar: string;
  onderwerp: string;
  tekst?: string;
  html?: string;
  replyTo?: string | null;
  aanvragerEmail?: string | null;
  sleutel?: string;
  templateId?: string;
  ontvangerRol?: string;
  bcc?: string[];
  headers?: Record<string, string>;
}): ResendInhoud {
  const replyTo = replyToVoor({
    sleutel: input.sleutel,
    templateId: input.templateId,
    ontvangerRol: input.ontvangerRol,
    aanvragerEmail: input.aanvragerEmail,
    replyTo: input.replyTo,
  });
  return {
    from: VAN_ADRES,
    to: [input.naar],
    subject: input.onderwerp,
    text: input.tekst,
    html: input.html,
    replyTo,
    ...(input.bcc?.length ? { bcc: input.bcc } : {}),
    ...(input.headers ? { headers: input.headers } : {}),
  };
}

export async function verstuurMetResend(
  inhoud: ResendInhoud,
  env: Record<string, string | undefined> = process.env,
): Promise<void> {
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new MailGeblokkeerd('RESEND_API_KEY ontbreekt');
  const { Resend } = await import('resend');
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: inhoud.from,
    to: inhoud.to,
    subject: inhoud.subject,
    text: inhoud.text,
    html: inhoud.html,
    replyTo: inhoud.replyTo,
    ...(inhoud.bcc?.length ? { bcc: inhoud.bcc } : {}),
    ...(inhoud.headers ? { headers: inhoud.headers } : {}),
  });
  if (error) throw new Error(error.message);
}

function resendTransport(): MailTransport {
  return {
    async verstuur(bericht) {
      const bcc = await toezichtBcc(bericht.naar, process.env, isInterneKerkjeSleutel(bericht.sleutel));
      const inhoud = bouwResendInhoud({
        naar: bericht.naar,
        onderwerp: bericht.onderwerp,
        tekst: bericht.tekst,
        html: bericht.html,
        replyTo: bericht.replyTo,
        aanvragerEmail: bericht.aanvragerEmail ?? bericht.replyTo,
        sleutel: bericht.sleutel,
        templateId: bericht.templateId,
        bcc,
      });
      await verstuurMetResend(inhoud);
    },
  };
}
