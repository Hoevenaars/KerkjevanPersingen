/**
 * Maakt een aanleverlink en mailt die naar de huurder.
 * De database bewaart alleen de hash. Gaat de mail niet uit, dan wordt de link gesloten.
 */

import type { Actor } from './operatie/kern.ts';
import { legVerzendingVast } from './communicatie-log.ts';
import { CONTRACTBEHEER_EMAIL, VAN_ADRES } from './mail-adressen.ts';
import { verstuurGecontroleerd, type TransportUitkomst } from './mail-transport.ts';
import { nieuwToegangstoken } from '../platform/magictoken.ts';
import { magSchrijven } from '../platform/rechten.ts';
import { emailGeldig } from '../platform/mail-poort.ts';
import {
  FOTO_AANLEVER_DAGEN,
  briefFotoAanlevering,
  fotoAanleverUrl,
} from '../platform/foto-aanlevering.ts';

export interface FotoAanleverResultaat {
  ok: boolean;
  melding: string;
}

export interface TokenClient {
  bewaar(rij: { boeking_id: number; doel: 'content'; token_hash: string; verloopt_op: string }): Promise<string | null>;
  sluit(hash: string, op: string): Promise<void>;
  trekAndereIn(boekingId: number, hash: string, op: string): Promise<void>;
}

type TokenQuery = {
  eq(kolom: string, waarde: unknown): TokenQuery & Promise<{ error: { message: string } | null }>;
  is(kolom: string, waarde: null): TokenQuery & Promise<{ error: { message: string } | null }>;
  neq(kolom: string, waarde: unknown): TokenQuery & Promise<{ error: { message: string } | null }>;
};

export function supabaseTokenClient(client: {
  from(tabel: string): {
    insert(rij: Record<string, unknown>): Promise<{ error: { message: string } | null }>;
    update(rij: Record<string, unknown>): TokenQuery;
  };
}): TokenClient {
  return {
    async bewaar(rij) {
      const uit = await client.from('toegangstokens').insert(rij);
      return uit.error?.message ?? null;
    },
    async sluit(hash, op) {
      await client.from('toegangstokens').update({ ingetrokken_op: op }).eq('token_hash', hash);
    },
    async trekAndereIn(boekingId, hash, op) {
      await client
        .from('toegangstokens')
        .update({ ingetrokken_op: op })
        .eq('boeking_id', boekingId)
        .eq('doel', 'content')
        .is('ingetrokken_op', null)
        .neq('token_hash', hash);
    },
  };
}

export interface FotoAanleverInvoer {
  tokens: TokenClient;
  boekingId: number;
  naam: string;
  email: string;
  basisUrl: string;
  actor: Actor;
  nu?: Date;
  verstuur?: (brief: {
    naar: string;
    onderwerp: string;
    html: string;
    tekst: string;
    idempotentie: string;
  }) => Promise<TransportUitkomst>;
  legVast?: typeof legVerzendingVast;
  noteer?: (actie: string, reden: string) => Promise<void>;
}

function leesbareFout(bericht: string): string {
  if (/invalid api key|jwt|unauthorized|401|permission denied|row-level security/i.test(bericht)) {
    return 'Geen recht of de sessie is verlopen. Er is niets gewijzigd en er is geen mail verstuurd.';
  }
  return 'De link kon niet worden gemaakt. Er is geen mail verstuurd.';
}

async function standaardVerstuur(brief: {
  naar: string;
  onderwerp: string;
  html: string;
  tekst: string;
  idempotentie: string;
}): Promise<TransportUitkomst> {
  return verstuurGecontroleerd({
    sleutel: 'handmatige_template',
    naar: brief.naar,
    onderwerp: brief.onderwerp,
    tekst: brief.tekst,
    html: brief.html,
    templateId: 'foto_aanlevering',
    richting: 'aanvrager',
    idempotentieSleutel: brief.idempotentie,
  });
}

export async function verstuurFotoAanlevering(input: FotoAanleverInvoer): Promise<FotoAanleverResultaat> {
  const rechten = input.actor.rechten ?? { isSuperAdmin: false, perModule: {} };
  if (!magSchrijven(rechten, 'agenda') && !magSchrijven(rechten, 'boekingen')) {
    return { ok: false, melding: 'Geen schrijfrecht op de agenda. Er is geen mail verstuurd.' };
  }
  if (!Number.isInteger(input.boekingId) || input.boekingId <= 0) {
    return { ok: false, melding: 'Er is geen boeking aan deze activiteit gekoppeld. Er is geen mail verstuurd.' };
  }
  const email = input.email.trim();
  if (!emailGeldig(email)) return { ok: false, melding: 'Er is geen geldig e-mailadres bij deze boeking. Er is geen mail verstuurd.' };

  const nu = input.nu ?? new Date();
  const token = nieuwToegangstoken();
  const url = fotoAanleverUrl(input.basisUrl, token.plain);
  if (!url) return { ok: false, melding: 'De link kon niet worden gemaakt. Er is geen mail verstuurd.' };
  const bewaard = await input.tokens.bewaar({
    boeking_id: input.boekingId,
    doel: 'content',
    token_hash: token.hash,
    verloopt_op: new Date(nu.getTime() + FOTO_AANLEVER_DAGEN * 86_400_000).toISOString(),
  });
  if (bewaard) return { ok: false, melding: leesbareFout(bewaard) };

  const brief = briefFotoAanlevering(input.naam, url);
  const dedup = `foto-aanlever:${input.boekingId}:${token.hash.slice(0, 16)}`;
  const verstuur = input.verstuur ?? standaardVerstuur;
  const legVast = input.legVast ?? legVerzendingVast;
  let uit: TransportUitkomst;
  try {
    uit = await verstuur({
      naar: email,
      onderwerp: brief.onderwerp,
      html: brief.html,
      tekst: brief.text,
      idempotentie: dedup,
    });
  } catch (error) {
    try {
      await input.tokens.sluit(token.hash, nu.toISOString());
    } catch {
      /* De mail is niet weg. */
    }
    return { ok: false, melding: error instanceof Error ? error.message : 'Verzenden mislukt. Er is geen mail verstuurd.' };
  }

  if (!uit.providerAangeroepen) {
    try {
      await input.tokens.sluit(token.hash, nu.toISOString());
    } catch {
      /* De mail is niet weg. Een sluitfout maakt de link niet alsnog zichtbaar in de melding. */
    }
    await legVast({
      aanvraagId: null,
      boekingId: String(input.boekingId),
      templateSleutel: 'foto_aanlevering',
      onderwerp: brief.onderwerp,
      bedoeldeOntvanger: email,
      werkelijkeOntvanger: '',
      afzender: VAN_ADRES,
      replyTo: CONTRACTBEHEER_EMAIL,
      richting: 'uitgaand',
      status: 'geblokkeerd',
      foutmelding: uit.melding || uit.besluit.reden,
      test: false,
      dedupSleutel: `${dedup}:geblokkeerd`,
      handmatig: true,
    });
    return { ok: false, melding: `Er is geen mail verstuurd. ${uit.melding || uit.besluit.reden}` };
  }

  try {
    await input.tokens.trekAndereIn(input.boekingId, token.hash, nu.toISOString());
  } catch {
    /* De mail is al geaccepteerd. Een oude link intrekken is geen tweede verzending. */
  }
  const gelogd = await legVast({
    aanvraagId: null,
    boekingId: String(input.boekingId),
    templateSleutel: 'foto_aanlevering',
    onderwerp: brief.onderwerp,
    bedoeldeOntvanger: email,
    werkelijkeOntvanger: uit.werkelijkeOntvanger || email,
    afzender: VAN_ADRES,
    replyTo: CONTRACTBEHEER_EMAIL,
    richting: 'uitgaand',
    status: 'verzonden',
    providerBerichtId: uit.providerBerichtId,
    foutmelding: 'Geaccepteerd door de e-mailprovider. Aflevering is niet bevestigd.',
    test: uit.besluit.modus === 'test',
    dedupSleutel: uit.besluit.modus === 'test' ? `test:${dedup}` : dedup,
    handmatig: true,
  });
  try {
    await input.noteer?.('foto_aanlevering_gemaild', 'Link voor de ontbrekende afbeelding verstuurd.');
  } catch {
    /* De mail is al geaccepteerd. Een mislukte auditregel versturt niet opnieuw. */
  }
  const naar = uit.werkelijkeOntvanger || email;
  return {
    ok: true,
    melding: gelogd.gelogd
      ? `Mail verzonden naar ${naar}. De link werkt ${FOTO_AANLEVER_DAGEN} dagen. Een eerdere link werkt niet meer.`
      : `Mail verzonden naar ${naar}. De verzendregel kon niet worden opgeslagen en is niet opnieuw verstuurd.`,
  };
}
