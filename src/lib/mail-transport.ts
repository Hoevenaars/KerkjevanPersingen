/**
 * Enige plek die een mailprovider mag aanroepen.
 * Uit, test en onbekend doen geen provider-call en markeren niets als verzonden.
 */

import { besluitVoor } from './automatisering-register.ts';
import { MailGeblokkeerd, type Automatisering, type Verzendbesluit } from '../platform/automatisering.ts';
import {
  GEEN_TESTMAILADRES,
  pasTestmodusToe,
  providerPayloadIsTestveilig,
  type Mailmodus,
} from '../platform/testmail.ts';
import { getTestMailRecipient } from './testmail-adres.ts';
import { CONTRACTBEHEER_EMAIL, VAN_ADRES, isNoreplyAdres, replyToHeader, replyToVoor, richtingVoorMail } from './mail-adressen.ts';
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
  aanvragerNaam?: string;
  templateId?: string;
  /** intern = notificatie over een aanvraag. aanvrager = mail naar de aanvrager of huurder. */
  richting?: 'intern' | 'aanvrager';
  modus?: Mailmodus;
  bedoeldeOntvanger?: string;
}

export interface ResendInhoud {
  from: string;
  to: string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo: string;
  replyToNaam?: string;
  bcc?: string[];
  cc?: string[];
  headers?: Record<string, string>;
  testmodus?: boolean;
}

export interface MailTransport {
  verstuur(bericht: MailBericht): Promise<string | null | void>;
}

export interface TransportUitkomst {
  verzonden: boolean;
  providerAangeroepen: boolean;
  besluit: Verzendbesluit;
  providerBerichtId?: string | null;
  bedoeldeOntvanger?: string;
  werkelijkeOntvanger?: string;
  geblokkeerd?: boolean;
  melding?: string;
}

export async function verstuurGecontroleerd(
  bericht: MailBericht,
  opties: {
    register?: readonly Automatisering[];
    transport?: MailTransport;
    modus?: Mailmodus;
    testadres?: string | null;
    env?: Record<string, unknown>;
  } = {},
): Promise<TransportUitkomst> {
  const besluit = await besluitVoor(bericht.sleutel, opties.register, opties.env);
  const modus: Mailmodus = opties.modus ?? bericht.modus ?? besluit.modus;
  const effectief: Verzendbesluit = { ...besluit, modus };
  if (modus === 'uit' || modus === 'dry-run' || !effectief.provider) {
    return {
      verzonden: false,
      providerAangeroepen: false,
      besluit: effectief,
      bedoeldeOntvanger: bericht.naar,
      geblokkeerd: modus !== 'dry-run',
      melding: effectief.reden,
    };
  }
  let uitgaand = bericht;
  if (modus === 'test') {
    const testadres = opties.testadres !== undefined ? opties.testadres : await getTestMailRecipient(opties.env);
    const veilig = pasTestmodusToe(
      {
        to: [bericht.naar],
        subject: bericht.onderwerp,
        replyTo: bericht.replyTo,
        bedoeldeOntvanger: bericht.bedoeldeOntvanger || bericht.naar,
      },
      testadres,
    );
    if (!veilig.ok) {
      return {
        verzonden: false,
        providerAangeroepen: false,
        besluit: effectief,
        bedoeldeOntvanger: bericht.naar,
        geblokkeerd: true,
        melding: GEEN_TESTMAILADRES,
      };
    }
    uitgaand = {
      ...bericht,
      naar: veilig.werkelijkeOntvanger,
      onderwerp: veilig.subject,
      modus: 'test',
      bedoeldeOntvanger: veilig.bedoeldeOntvanger,
      replyTo: veilig.replyTo,
    };
  }
  const transport = opties.transport ?? resendTransport();
  const providerBerichtId = await transport.verstuur(uitgaand);
  return {
    verzonden: true,
    providerAangeroepen: true,
    besluit: effectief,
    providerBerichtId: typeof providerBerichtId === 'string' ? providerBerichtId : null,
    bedoeldeOntvanger: uitgaand.bedoeldeOntvanger || bericht.naar,
    werkelijkeOntvanger: uitgaand.naar,
  };
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
  aanvragerNaam?: string | null;
  sleutel?: string;
  templateId?: string;
  ontvangerRol?: string;
  richting?: 'intern' | 'aanvrager';
  bcc?: string[];
  headers?: Record<string, string>;
}): ResendInhoud {
  const richting = richtingVoorMail(input);
  const replyTo = replyToVoor({
    sleutel: input.sleutel,
    templateId: input.templateId,
    ontvangerRol: input.ontvangerRol,
    aanvragerEmail: input.aanvragerEmail,
    replyTo: input.replyTo,
    richting,
  });
  return {
    from: VAN_ADRES,
    to: [input.naar],
    subject: input.onderwerp,
    text: input.tekst,
    html: input.html,
    replyTo,
    replyToNaam: replyTo === CONTRACTBEHEER_EMAIL ? 'Contractbeheer' : input.aanvragerNaam ?? undefined,
    ...(input.bcc?.length ? { bcc: input.bcc } : {}),
    ...(input.headers ? { headers: input.headers } : {}),
  };
}

/**
 * Interne notificatie over een aanvraag.
 * From blijft het sending-only adres. Reply-To is altijd het aanvrageradres,
 * of contractbeheer als dat adres ontbreekt.
 */
export async function sendInterneAanvraagMail(
  input: {
    to: string;
    subject: string;
    html?: string;
    text?: string;
    aanvragerEmail?: string | null;
    aanvragerNaam?: string | null;
    sleutel?: string;
  },
  opties: {
    register?: readonly Automatisering[];
    transport?: MailTransport;
  } = {},
): Promise<TransportUitkomst> {
  return verstuurGecontroleerd(
    {
      sleutel: input.sleutel ?? 'aanvraag_bestuur',
      naar: input.to,
      onderwerp: input.subject,
      tekst: input.text ?? '',
      html: input.html,
      aanvragerEmail: input.aanvragerEmail ?? undefined,
      aanvragerNaam: input.aanvragerNaam ?? undefined,
      richting: 'intern',
    },
    opties,
  );
}

/** Systeemmail naar de aanvrager of huurder. Beantwoorden gaat naar contractbeheer. */
export async function sendMailNaarAanvrager(
  input: {
    to: string;
    subject: string;
    html?: string;
    text?: string;
    sleutel: string;
    templateId?: string;
  },
  opties: {
    register?: readonly Automatisering[];
    transport?: MailTransport;
  } = {},
): Promise<TransportUitkomst> {
  return verstuurGecontroleerd(
    {
      sleutel: input.sleutel,
      naar: input.to,
      onderwerp: input.subject,
      tekst: input.text ?? '',
      html: input.html,
      templateId: input.templateId,
      richting: 'aanvrager',
    },
    opties,
  );
}

export async function verstuurMetResend(
  inhoud: ResendInhoud,
  env: Record<string, string | undefined> = process.env,
): Promise<string | null> {
  if (inhoud.testmodus && !providerPayloadIsTestveilig(inhoud, inhoud.to[0] ?? '')) {
    throw new MailGeblokkeerd(GEEN_TESTMAILADRES);
  }
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new MailGeblokkeerd('RESEND_API_KEY ontbreekt');
  const replyTo = replyToHeader(inhoud.replyTo, inhoud.replyToNaam);
  if (isNoreplyAdres(replyTo)) {
    throw new Error('Reply-To wijst naar het sending-only adres');
  }
  const { Resend } = await import('resend');
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from: inhoud.from,
    to: inhoud.to,
    subject: inhoud.subject,
    text: inhoud.text ?? '',
    html: inhoud.html,
    replyTo,
    ...(inhoud.testmodus || !inhoud.bcc?.length ? {} : { bcc: inhoud.bcc }),
    ...(inhoud.headers ? { headers: inhoud.headers } : {}),
  });
  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

function resendTransport(): MailTransport {
  return {
    async verstuur(bericht) {
      const test = bericht.modus === 'test';
      const bcc = test ? [] : await toezichtBcc(bericht.naar, process.env, isInterneKerkjeSleutel(bericht.sleutel));
      const inhoud = bouwResendInhoud({
        naar: bericht.naar,
        onderwerp: bericht.onderwerp,
        tekst: bericht.tekst,
        html: bericht.html,
        replyTo: bericht.replyTo,
        aanvragerEmail: bericht.aanvragerEmail,
        aanvragerNaam: bericht.aanvragerNaam,
        sleutel: bericht.sleutel,
        templateId: bericht.templateId,
        richting: bericht.richting,
        bcc,
      });
      if (test) {
        inhoud.bcc = [];
        inhoud.cc = [];
        inhoud.testmodus = true;
      }
      return verstuurMetResend(inhoud);
    },
  };
}
