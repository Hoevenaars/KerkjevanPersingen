/**
 * Meer informatie vragen: concept zonder provider, verzenden alleen via de schakelaar.
 */

import { createHash } from 'node:crypto';
import { magStatusZetten } from '../../platform/aanvraag.ts';
import { kerkjeMail } from '../kerkje-mail.ts';
import { CONTRACTBEHEER_EMAIL, VAN_ADRES } from '../mail-adressen.ts';
import { sendMailNaarAanvrager } from '../mail-transport.ts';
import { legVerzendingVast } from '../communicatie-log.ts';
import { magSchrijven } from '../../platform/rechten.ts';
import type { AanvraagStatus, GebruikerRechten } from '../../platform/types.ts';
import type { Actor } from './kern.ts';

export interface InformatieResultaat {
  ok: boolean;
  melding: string;
}

interface InformatieClient {
  from(tabel: string): {
    select: (kolommen: string) => {
      eq: (kolom: string, waarde: unknown) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
      };
    };
    update: (waarden: Record<string, unknown>) => {
      eq: (kolom: string, waarde: unknown) => {
        select: (kolommen: string) => {
          maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
        };
      };
    };
    insert: (rij: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  };
}

function leesbareAuthFout(bericht: string): string {
  if (/invalid api key|jwt|unauthorized|401|permission denied|row-level security/i.test(bericht)) {
    return 'Geen recht of de sessie is verlopen. Er is niets gewijzigd. Log opnieuw in.';
  }
  return bericht;
}

function rechtenVan(actor: Actor): GebruikerRechten {
  return actor.rechten ?? { isSuperAdmin: false, perModule: {} };
}

function hashVraag(vraag: string): string {
  return createHash('sha256').update(vraag.trim()).digest('hex').slice(0, 16);
}

export function briefMeerInformatie(naam: string, vraag: string): { onderwerp: string; html: string; text: string } {
  const aanhef = naam.trim().split(' ')[0] || naam;
  const mail = kerkjeMail({
    titel: 'Aanvullende vraag over je aanvraag',
    aanhef: `Beste ${aanhef},`,
    hoofdtekst: `We hebben nog een vraag over je aanvraag voor het Kerkje van Persingen.\n\n${vraag.trim()}`,
    slot: 'Je kunt antwoorden op deze mail.',
    ondertekening: 'Stichting Het Kerkje van Persingen',
  });
  return { onderwerp: 'Aanvullende vraag over je aanvraag', html: mail.html, text: mail.text };
}

export async function bewaarInformatievraag(
  client: InformatieClient,
  aanvraagId: number,
  vraag: string,
  actor: Actor,
): Promise<InformatieResultaat> {
  if (!magSchrijven(rechtenVan(actor), 'aanvragen')) return { ok: false, melding: 'Geen schrijfrecht op aanvragen.' };
  const tekst = vraag.trim();
  if (!tekst) return { ok: false, melding: 'Een informatievraag is verplicht.' };
  const huidig = await client.from('aanvragen').select('id,status,email').eq('id', aanvraagId).maybeSingle();
  if (huidig.error) return { ok: false, melding: leesbareAuthFout(huidig.error.message) };
  if (!huidig.data?.id) return { ok: false, melding: 'Aanvraag niet gevonden.' };
  const status = String(huidig.data.status);
  const check = magStatusZetten(status as AanvraagStatus, 'wacht_op_aanvrager', rechtenVan(actor));
  if (!check.ok && status !== 'wacht_op_aanvrager') return { ok: false, melding: check.melding ?? 'Overgang geweigerd.' };
  const update = await client
    .from('aanvragen')
    .update({ status: 'wacht_op_aanvrager', informatievraag: tekst })
    .eq('id', aanvraagId)
    .select('id')
    .maybeSingle();
  if (update.error) return { ok: false, melding: leesbareAuthFout(update.error.message) };
  if (!update.data?.id) return { ok: false, melding: 'Aanvraag niet bijgewerkt.' };
  await client.from('communicatie_jobs').insert({
    aanvraag_id: aanvraagId,
    template_sleutel: 'booking_more_information_requested',
    dedup_sleutel: `job:aanvraag:${aanvraagId}:booking_more_information_requested:${hashVraag(tekst)}`,
    status: 'concept',
    modus: 'concept',
    ontvanger_email: String(huidig.data.email ?? ''),
    onderwerp: 'Aanvullende vraag over je aanvraag',
    gepland_op: new Date().toISOString(),
    pogingen: 0,
  });
  await client.from('auditlog').insert({
    actor_id: actor.id && /^[0-9a-f-]{36}$/i.test(actor.id) ? actor.id : null,
    actor_naam: actor.naam,
    actor_type: actor.type,
    onderwerp_type: 'aanvraag',
    onderwerp_id: String(aanvraagId),
    actie: 'meer_informatie',
    van: status,
    naar: 'wacht_op_aanvrager',
    reden: tekst,
    dedup_sleutel: `aanvraag:${aanvraagId}:meer_informatie:${hashVraag(tekst)}`,
  });
  return { ok: true, melding: 'Vraag opgeslagen als concept. Er is geen mail verstuurd.' };
}

export async function verstuurInformatievraag(
  client: InformatieClient,
  aanvraagId: number,
  actor: Actor,
): Promise<InformatieResultaat> {
  if (!magSchrijven(rechtenVan(actor), 'aanvragen')) return { ok: false, melding: 'Geen schrijfrecht op aanvragen.' };
  const huidig = await client.from('aanvragen').select('id,status,naam,email,informatievraag').eq('id', aanvraagId).maybeSingle();
  if (huidig.error) return { ok: false, melding: leesbareAuthFout(huidig.error.message) };
  if (!huidig.data?.id) return { ok: false, melding: 'Aanvraag niet gevonden.' };
  const vraag = String(huidig.data.informatievraag ?? '').trim();
  if (!vraag) return { ok: false, melding: 'Er is nog geen vraag opgeslagen.' };
  const dedup = `info:${aanvraagId}:${hashVraag(vraag)}`;
  const bestaand = await client.from('communicatie_verzendingen').select('id,status').eq('dedup_sleutel', dedup).maybeSingle();
  if (bestaand.error) return { ok: false, melding: 'Verzending geblokkeerd: de historie kon niet worden gecontroleerd.' };
  if (bestaand.data?.status === 'verzonden') return { ok: true, melding: 'Deze vraag is al verzonden.' };
  const brief = briefMeerInformatie(String(huidig.data.naam ?? ''), vraag);
  let uit;
  try {
    uit = await sendMailNaarAanvrager({
      to: String(huidig.data.email ?? ''),
      subject: brief.onderwerp,
      html: brief.html,
      text: brief.text,
      sleutel: 'statusmail_huurder',
      templateId: 'booking_more_information_requested',
    });
  } catch (error) {
    return { ok: false, melding: error instanceof Error ? error.message : 'Verzenden mislukt. Er is niet opnieuw geprobeerd.' };
  }
  if (!uit.providerAangeroepen) {
    await legVerzendingVast({
      aanvraagId: String(aanvraagId),
      templateSleutel: 'booking_more_information_requested',
      onderwerp: brief.onderwerp,
      bedoeldeOntvanger: String(huidig.data.email ?? ''),
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
    return { ok: true, melding: `Concept blijft staan. ${uit.melding || uit.besluit.reden} Er is geen mail verstuurd.` };
  }
  const gelogd = await legVerzendingVast({
    aanvraagId: String(aanvraagId),
    templateSleutel: 'booking_more_information_requested',
    onderwerp: brief.onderwerp,
    bedoeldeOntvanger: String(huidig.data.email ?? ''),
    werkelijkeOntvanger: uit.werkelijkeOntvanger || String(huidig.data.email ?? ''),
    afzender: VAN_ADRES,
    replyTo: CONTRACTBEHEER_EMAIL,
    richting: 'uitgaand',
    status: 'verzonden',
    providerBerichtId: uit.providerBerichtId,
    test: uit.besluit.modus === 'test',
    dedupSleutel: dedup,
    handmatig: true,
  });
  return {
    ok: true,
    melding: gelogd.gelogd
      ? `Vraag verzonden naar ${uit.werkelijkeOntvanger}.`
      : 'Vraag verzonden. De verzendregel kon niet worden opgeslagen en is niet opnieuw verstuurd.',
  };
}
