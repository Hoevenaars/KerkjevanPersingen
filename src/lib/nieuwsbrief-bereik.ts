/**
 * Openen en doorklikken van een verstuurde nieuwsbrief.
 * Alleen de ontvanger die we zelf hebben aangeschreven. Geen IP, geen user-agent.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

const HANDTEKENING_VENSTER_MS = 5 * 60 * 1000;

export interface BereikPersoon {
  naam: string;
  email: string;
  geopendOp: string | null;
  activiteitOp: string | null;
}

export interface BereikOverzicht {
  verstuurd: number;
  geopend: number;
  nietGeopend: number;
  activiteit: number;
  personen: BereikPersoon[];
}

export interface BereikRij {
  nieuwsbriefId: string;
  naam: string;
  email: string;
  test: boolean;
  status: string;
  geopendOp: string | null;
  activiteitOp: string | null;
}

export interface ResendMailGebeurtenis {
  soort: 'geopend' | 'geklikt';
  emailId: string;
  editieId: string | null;
  vriendId: string | null;
  vanOns: boolean;
  activiteit: boolean;
}

export function isActiviteitLink(url: string | null | undefined): boolean {
  if (!url) return false;
  let adres: URL;
  try {
    adres = new URL(url);
  } catch {
    return false;
  }
  const host = adres.hostname.replace(/^www\./, '').toLowerCase();
  if (host !== 'kerkjepersingen.nl' && host !== 'localhost' && host !== '127.0.0.1') return false;
  const pad = adres.pathname.replace(/\/+$/, '') || '/';
  return pad === '/agenda' || /^\/agenda\/[^/]+$/.test(pad);
}

export function verifieerResendHandtekening(input: {
  payload: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  secret: string;
  nu?: number;
}): boolean {
  const { id, timestamp, signature, secret } = input;
  if (!id || !timestamp || !signature || !secret.startsWith('whsec_')) return false;
  const seconden = Number(timestamp);
  if (!Number.isFinite(seconden)) return false;
  const nu = input.nu ?? Date.now();
  if (Math.abs(nu - seconden * 1000) > HANDTEKENING_VENSTER_MS) return false;
  const geheim = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const verwacht = createHmac('sha256', geheim).update(`${id}.${timestamp}.${input.payload}`).digest('base64');
  const verwachtBuffer = Buffer.from(verwacht);
  return signature.split(' ').some((deel) => {
    if (!deel.startsWith('v1,')) return false;
    const gekregen = Buffer.from(deel.slice(3));
    return gekregen.length === verwachtBuffer.length && timingSafeEqual(gekregen, verwachtBuffer);
  });
}

function leesTags(waarde: unknown): Record<string, string> {
  const tags: Record<string, string> = {};
  if (Array.isArray(waarde)) {
    for (const item of waarde) {
      if (!item || typeof item !== 'object') continue;
      const naam = (item as { name?: unknown }).name;
      const inhoud = (item as { value?: unknown }).value;
      if (typeof naam === 'string' && typeof inhoud === 'string') tags[naam] = inhoud;
    }
    return tags;
  }
  if (waarde && typeof waarde === 'object') {
    for (const [naam, inhoud] of Object.entries(waarde)) {
      if (typeof inhoud === 'string') tags[naam] = inhoud;
    }
  }
  return tags;
}

/** Alleen het soort gebeurtenis, het mail-id en of de activiteitlink is. Geen netwerkadres. */
export function leesResendGebeurtenis(body: unknown): ResendMailGebeurtenis | null {
  if (!body || typeof body !== 'object') return null;
  const type = (body as { type?: unknown }).type;
  if (type !== 'email.opened' && type !== 'email.clicked') return null;
  const data = (body as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return null;
  const emailId = (data as { email_id?: unknown }).email_id;
  if (typeof emailId !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(emailId)) return null;
  const tags = leesTags((data as { tags?: unknown }).tags);
  const klik = (data as { click?: unknown }).click;
  const link = klik && typeof klik === 'object' && typeof (klik as { link?: unknown }).link === 'string'
    ? (klik as { link: string }).link
    : null;
  const vanOns = tags.soort === 'nieuwsbrief';
  return {
    soort: type === 'email.opened' ? 'geopend' : 'geklikt',
    emailId,
    editieId: /^\d{1,18}$/.test(tags.editie ?? '') ? tags.editie : null,
    vriendId: /^\d{1,18}$/.test(tags.vriend ?? '') ? tags.vriend : null,
    vanOns,
    activiteit: type === 'email.clicked' && isActiviteitLink(link),
  };
}

export function bereikPatch(
  huidig: { geopendOp: string | null; activiteitOp: string | null },
  gebeurtenis: Pick<ResendMailGebeurtenis, 'soort' | 'activiteit'>,
  moment: string,
): { geopendOp: string | null; activiteitOp: string | null } {
  const geopend = gebeurtenis.soort === 'geopend' || gebeurtenis.activiteit;
  return {
    geopendOp: huidig.geopendOp ?? (geopend ? moment : null),
    activiteitOp: gebeurtenis.activiteit ? (huidig.activiteitOp ?? moment) : huidig.activiteitOp,
  };
}

export function bereikVanRijen(rijen: readonly BereikRij[], nieuwsbriefId: string): BereikOverzicht {
  const personen = rijen
    .filter((rij) => rij.nieuwsbriefId === nieuwsbriefId && !rij.test && rij.status === 'verzonden' && rij.email.trim())
    .map((rij) => ({
      naam: rij.naam.trim() || rij.email.trim(),
      email: rij.email.trim(),
      geopendOp: rij.geopendOp,
      activiteitOp: rij.activiteitOp,
    }))
    .sort((a, b) => a.naam.localeCompare(b.naam, 'nl') || a.email.localeCompare(b.email, 'nl'));
  const geopend = personen.filter((persoon) => persoon.geopendOp || persoon.activiteitOp).length;
  const activiteit = personen.filter((persoon) => persoon.activiteitOp).length;
  return {
    verstuurd: personen.length,
    geopend,
    nietGeopend: personen.length - geopend,
    activiteit,
    personen,
  };
}
