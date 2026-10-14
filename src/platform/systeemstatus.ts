/**
 * Alleen observeren. Geen geheimen, geen tokens, geen ruwe foutpayloads.
 */

const GEHEIM = /\b(re_[A-Za-z0-9_]+|sb_[A-Za-z0-9_]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|bearer\s+[A-Za-z0-9._~+/-]+=*)\b/gi;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export function veiligStatusTekst(waarde: unknown): string {
  return String(waarde ?? '')
    .replace(GEHEIM, '[geheim]')
    .replace(EMAIL, '[adres]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

export interface SysteemSignaal {
  naam: string;
  staat: 'ja' | 'nee' | 'onbekend';
  toelichting: string;
}

export function supabaseSignaal(bereikbaar: boolean | null): SysteemSignaal {
  if (bereikbaar == null) return { naam: 'Database', staat: 'onbekend', toelichting: 'Geen betrouwbare meting.' };
  return {
    naam: 'Database',
    staat: bereikbaar ? 'ja' : 'nee',
    toelichting: bereikbaar ? 'Supabase-database antwoordde.' : 'Supabase-database antwoordde niet.',
  };
}

export function resendSignaal(input: { sleutelAanwezig: boolean; laatsteVerzending: string | null; laatsteFout: string | null }): SysteemSignaal[] {
  return [
    {
      naam: 'Resend-configuratie',
      staat: input.sleutelAanwezig ? 'ja' : 'nee',
      toelichting: input.sleutelAanwezig ? 'Er is een sleutel geconfigureerd. De sleutel zelf wordt niet getoond.' : 'Geen Resend-sleutel aanwezig.',
    },
    {
      naam: 'Laatste verzending',
      staat: input.laatsteVerzending ? 'ja' : 'onbekend',
      toelichting: input.laatsteVerzending ? veiligStatusTekst(input.laatsteVerzending) : 'Geen verzending geregistreerd.',
    },
    {
      naam: 'Laatste fout',
      staat: input.laatsteFout ? 'nee' : 'onbekend',
      toelichting: input.laatsteFout ? veiligStatusTekst(input.laatsteFout) : 'Geen fout geregistreerd.',
    },
  ];
}

export const BEKENDE_CRONROUTES = [
  '/api/cron/workflow',
  '/api/cron/nieuwsbrief-preview',
  '/api/cron/nieuwsbrief-verzenden',
] as const;

export function cronSignaal(input: { route: string; laatsteRun: string | null; status: string | null }): SysteemSignaal {
  return {
    naam: input.route,
    staat: input.laatsteRun ? 'ja' : 'onbekend',
    toelichting: input.laatsteRun
      ? `Laatste geregistreerde run ${veiligStatusTekst(input.laatsteRun)} (${veiligStatusTekst(input.status || 'onbekend')}). Dit bewijst niet dat Vercel-cron liep als de run ergens anders vandaan kwam.`
      : 'Geen geregistreerde run. Dat betekent niet dat Vercel-cron wel of niet liep.',
  };
}
