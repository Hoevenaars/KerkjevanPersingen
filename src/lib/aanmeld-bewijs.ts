/**
 * Poort voor de nieuwsbriefaanmelding.
 *
 * Een script dat alleen een e-mailadres post, komt er niet door. Het formulier
 * krijgt een tijdstip dat met een servergeheim is ondertekend, gekoppeld aan
 * een cookie die de browser bij het openen van de pagina meekrijgt. Te snel,
 * te oud, een andere cookie of een vervalste handtekening wordt geweigerd.
 * Een honeypot en een bekende bot-user-agent krijgen stil een geslaagde
 * pagina, zodat het script niet leert dat de aanmelding is genegeerd.
 */

import { isEvidenteAutomation } from '../analytics/bot.ts';

export const AANMELD_COOKIE = 'vrienden_bewijs';
export const MIN_INVULTIJD_MS = 2_000;
export const MAX_INVULTIJD_MS = 2 * 60 * 60 * 1000;
const GLOBAAL_VENSTER_MS = 15 * 60 * 1000;
const GLOBAAL_MAX = 30;

const globaalTijden: number[] = [];

export function aanmeldCookieOpties(secure: boolean): {
  httpOnly: true;
  sameSite: 'lax';
  path: string;
  maxAge: number;
  secure: boolean;
} {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/vrienden',
    maxAge: Math.floor(MAX_INVULTIJD_MS / 1000),
    secure,
  };
}

/** Leeg in productie als er geen servergeheim is. Dan slaan we niets op. */
export function aanmeldGeheim(
  env: Record<string, string | undefined>,
  ontwikkel = false,
): string {
  const echt = (env.NIEUWSBRIEF_FORM_GEHEIM || env.CRON_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (echt) return echt;
  return ontwikkel ? 'lokale-aanmeldpoort' : '';
}

export function resetAanmeldLimiet(): void {
  globaalTijden.length = 0;
}

/** True als deze serverinstantie in een kwartier al te veel geldige aanmeldingen zag. */
export function aanmeldGlobaalTeVaak(nu = Date.now()): boolean {
  while (globaalTijden.length > 0 && nu - globaalTijden[0] >= GLOBAAL_VENSTER_MS) globaalTijden.shift();
  if (globaalTijden.length >= GLOBAAL_MAX) return true;
  globaalTijden.push(nu);
  return false;
}

export async function maakAanmeldbewijs(geheim: string, nonce: string, nu = Date.now()): Promise<string> {
  const lading = `${nu}.${nonce}`;
  const mac = await teken(lading, geheim);
  return `${lading}.${mac}`;
}

export type AanmeldActie =
  | { actie: 'opslaan' }
  | { actie: 'stil' }
  | { actie: 'weiger'; melding: string };

export async function oordeelAanmelding(invoer: {
  honeypot: string;
  bewijs: string;
  nonceUitCookie: string;
  userAgent: string | null;
  oorsprongOk: boolean;
  geheim: string;
  nu?: number;
  limietBereikt?: () => boolean;
}): Promise<AanmeldActie> {
  if (invoer.honeypot.trim().length > 0) return { actie: 'stil' };
  const ua = (invoer.userAgent ?? '').trim();
  if (!ua || isEvidenteAutomation(ua)) return { actie: 'stil' };
  if (!invoer.geheim) {
    return { actie: 'weiger', melding: 'Aanmelden is tijdelijk niet mogelijk. Probeer het later opnieuw.' };
  }

  const gelezen = await leesBewijs(invoer.bewijs, invoer.geheim, invoer.nu ?? Date.now());
  if (!gelezen.ok) {
    if (gelezen.reden === 'te-snel') {
      return {
        actie: 'weiger',
        melding: 'Het formulier is te snel verstuurd. Wacht een moment en probeer het opnieuw.',
      };
    }
    return { actie: 'weiger', melding: 'De aanmelding is verlopen. Vernieuw de pagina en probeer het opnieuw.' };
  }
  if (!gelijk(gelezen.nonce, invoer.nonceUitCookie.trim())) {
    return { actie: 'weiger', melding: 'De aanmelding is verlopen. Vernieuw de pagina en probeer het opnieuw.' };
  }
  if (!invoer.oorsprongOk) {
    return { actie: 'weiger', melding: 'De aanmelding komt niet van deze site. Vernieuw de pagina en probeer het opnieuw.' };
  }
  if (invoer.limietBereikt?.()) {
    return { actie: 'weiger', melding: 'Er zijn net veel aanmeldingen. Probeer het over een kwartier opnieuw.' };
  }
  return { actie: 'opslaan' };
}

async function leesBewijs(
  bewijs: string,
  geheim: string,
  nu: number,
): Promise<{ ok: true; nonce: string } | { ok: false; reden: 'ongeldig' | 'te-snel' | 'verlopen' }> {
  const delen = bewijs.split('.');
  if (delen.length !== 3) return { ok: false, reden: 'ongeldig' };
  const [tijd, nonce, mac] = delen;
  if (!/^\d{10,16}$/.test(tijd) || !/^[0-9a-f-]{36}$/i.test(nonce)) return { ok: false, reden: 'ongeldig' };
  const verwacht = await teken(`${tijd}.${nonce}`, geheim);
  if (!gelijk(verwacht, mac)) return { ok: false, reden: 'ongeldig' };
  const leeftijd = nu - Number(tijd);
  if (leeftijd < MIN_INVULTIJD_MS) return { ok: false, reden: 'te-snel' };
  if (leeftijd > MAX_INVULTIJD_MS) return { ok: false, reden: 'verlopen' };
  return { ok: true, nonce };
}

async function teken(lading: string, geheim: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(geheim),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(lading));
  return base64url(new Uint8Array(mac));
}

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function gelijk(a: string, b: string): boolean {
  const links = new TextEncoder().encode(a);
  const rechts = new TextEncoder().encode(b);
  const lengte = Math.max(links.length, rechts.length);
  let verschil = links.length === rechts.length ? 0 : 1;
  for (let i = 0; i < lengte; i++) verschil |= (links[i] ?? 0) ^ (rechts[i] ?? 0);
  return verschil === 0;
}
