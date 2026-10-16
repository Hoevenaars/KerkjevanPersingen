/**
 * Goedgekeurde expositiecontent naar één social-media-ontvanger.
 * De schakelaar social_media_content blijft de poort. Uit doet geen provider-call.
 */

import { kerkjeMail } from '../lib/kerkje-mail.ts';
import { formatActiviteitTitel } from './activiteit-titel.ts';
import { formatExposantenWeergave } from './exposanten.ts';
import type { MailBericht } from '../lib/mail-transport.ts';
import type { Verzendbesluit } from './automatisering.ts';
import { normaliseerTestmailadres } from './testmail.ts';

export const SOCIAL_MEDIA_SLEUTEL = 'social_media_content';
export const SOCIAL_MEDIA_EMAIL_SLEUTEL = 'social_media_content_email';
export const SOCIAL_MEDIA_HELPER =
  'Goedgekeurde content voor exposities wordt naar dit adres gestuurd zolang automatische publicatie naar social media nog niet actief is.';
export const SOCIAL_MEDIA_SLOT =
  'Deze content is goedgekeurd en kan worden gebruikt voor communicatie via social media.';

const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

export function leesSocialMediaEmail(
  ruw: unknown,
): { ok: true; adres: string } | { ok: false; reden: string } {
  if (ruw == null) return { ok: true, adres: '' };
  const tekst = String(ruw).trim();
  if (!tekst) return { ok: true, adres: '' };
  const check = normaliseerTestmailadres(tekst);
  if (!check.ok) {
    return {
      ok: false,
      reden: check.reden === 'lijst'
        ? 'Vul één e-mailadres in, zonder komma of spatie.'
        : 'Dit is geen geldig e-mailadres.',
    };
  }
  return { ok: true, adres: check.adres };
}

export function socialMediaDedup(boekingId: string, versie: number): string {
  return `social-media:${boekingId}:${versie}`;
}

export function contentIsGoedgekeurd(input: { inhoudStatus?: string | null; contentstatus?: string | null }): boolean {
  return input.inhoudStatus === 'goedgekeurd' || input.contentstatus === 'goedgekeurd';
}

export function socialDatum(start: string, eind?: string | null): string {
  const lees = (ymd: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd.trim());
    if (!match) return null;
    return { jaar: Number(match[1]), maand: Number(match[2]), dag: Number(match[3]) };
  };
  const van = lees(start);
  if (!van) return start.trim();
  const tot = lees(eind || start) ?? van;
  const maand = MAANDEN[van.maand - 1] ?? '';
  if (van.jaar === tot.jaar && van.maand === tot.maand && van.dag === tot.dag) {
    return `${van.dag} ${maand} ${van.jaar}`;
  }
  if (van.jaar === tot.jaar && van.maand === tot.maand) {
    return `${van.dag} en ${tot.dag} ${maand} ${van.jaar}`;
  }
  const maandTot = MAANDEN[tot.maand - 1] ?? '';
  return `${van.dag} ${maand} ${van.jaar} en ${tot.dag} ${maandTot} ${tot.jaar}`;
}

export interface SocialMediaInhoud {
  boekingId: string;
  versie: number;
  goedgekeurd: boolean;
  soort: string;
  titel: string;
  start: string;
  eind?: string | null;
  exposanten: string;
  korteTekst: string;
  langeTekst: string;
  fotos: readonly { label: string; url: string }[];
  beheerUrl?: string;
  ontvanger: string;
  alVerstuurd: boolean;
}

export interface SocialMediaPlan {
  versturen: boolean;
  provider: boolean;
  reden: string;
  dedup: string;
  bedoeldeOntvanger: string;
  bericht?: MailBericht;
}

export function planSocialMediaVerzending(inhoud: SocialMediaInhoud, besluit: Verzendbesluit): SocialMediaPlan {
  const dedup = socialMediaDedup(inhoud.boekingId, inhoud.versie);
  const ontvanger = leesSocialMediaEmail(inhoud.ontvanger);
  const basis = {
    dedup,
    bedoeldeOntvanger: ontvanger.ok ? ontvanger.adres : inhoud.ontvanger.trim(),
  };
  if (!inhoud.goedgekeurd) {
    return { ...basis, versturen: false, provider: false, reden: 'Content is nog niet goedgekeurd.' };
  }
  if (inhoud.alVerstuurd) {
    return { ...basis, versturen: false, provider: false, reden: 'Deze goedgekeurde versie is al verzonden.' };
  }
  if (!besluit.provider || besluit.modus === 'uit' || besluit.modus === 'dry-run') {
    return { ...basis, versturen: false, provider: false, reden: besluit.reden || 'automatisering uit' };
  }
  if (!ontvanger.ok) {
    return { ...basis, versturen: false, provider: false, reden: ontvanger.reden };
  }
  if (!ontvanger.adres) {
    return { ...basis, versturen: false, provider: false, reden: 'Geen social-media-ontvanger ingesteld. Er is niets verzonden.' };
  }
  const titel = formatActiviteitTitel(inhoud.soort || 'expositie', inhoud.titel) || inhoud.titel.trim();
  const datum = socialDatum(inhoud.start, inhoud.eind);
  const onderwerp = `Goedgekeurde content - ${titel}${datum ? ` - ${datum}` : ''}`;
  const exposanten = formatExposantenWeergave(inhoud.exposanten);
  const regels = [
    titel,
    datum ? `Datum: ${datum}` : '',
    exposanten ? `Exposanten: ${exposanten}` : '',
    inhoud.korteTekst.trim() ? `Korte tekst:\n${inhoud.korteTekst.trim()}` : '',
    inhoud.langeTekst.trim() ? `Uitgebreide tekst:\n${inhoud.langeTekst.trim()}` : '',
  ].filter(Boolean);
  if (inhoud.fotos.length > 0) {
    regels.push('Foto\'s (de downloadlinks zijn tijdelijk):');
    for (const foto of inhoud.fotos) {
      if (foto.url.trim()) regels.push(`${foto.label}: ${foto.url.trim()}`);
    }
  }
  const mail = kerkjeMail({
    titel,
    hoofdtekst: regels.join('\n\n'),
    slot: SOCIAL_MEDIA_SLOT,
    cta: inhoud.beheerUrl ? [{ label: 'Open in beheer', href: inhoud.beheerUrl }] : [],
    secundair: inhoud.fotos.length > 0 ? 'De downloadlinks zijn tijdelijk en niet openbaar.' : undefined,
  });
  return {
    ...basis,
    versturen: true,
    provider: true,
    reden: besluit.reden,
    bericht: {
      sleutel: SOCIAL_MEDIA_SLEUTEL,
      naar: ontvanger.adres,
      onderwerp,
      tekst: mail.text,
      html: mail.html,
      bedoeldeOntvanger: ontvanger.adres,
      richting: 'aanvrager',
    },
  };
}
