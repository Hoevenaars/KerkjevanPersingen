/**
 * Staging mag geen echte klanten mailen.
 * Productie (VERCEL_ENV=production, zonder MAIL_GUARD=staging) blijft ongewijzigd.
 * De 3.0-verzendlaag gebruikt dit; de bestaande Sanity-aanvraagmail niet.
 */

export interface MailGuardUitkomst {
  toegestaan: boolean;
  naar: string | null;
  onderwerpPrefix: string;
  reden: 'productie' | 'override' | 'allowlist' | 'geblokkeerd';
}

function lijst(waarde: unknown): string[] {
  return String(waarde ?? '')
    .split(',')
    .map((deel) => deel.trim().toLowerCase())
    .filter(Boolean);
}

export function bewaakUitgaandeMail(
  env: Record<string, unknown>,
  naar: string,
): MailGuardUitkomst {
  const productie = env.VERCEL_ENV === 'production' && env.MAIL_GUARD !== 'staging';
  if (productie) {
    return { toegestaan: true, naar, onderwerpPrefix: '', reden: 'productie' };
  }

  const override = String(env.MAIL_STAGING_OVERRIDE ?? '').trim();
  if (override) {
    return { toegestaan: true, naar: override, onderwerpPrefix: '[STAGING] ', reden: 'override' };
  }

  const allow = lijst(env.MAIL_STAGING_ALLOWLIST);
  if (allow.includes(naar.trim().toLowerCase())) {
    return { toegestaan: true, naar, onderwerpPrefix: '[STAGING] ', reden: 'allowlist' };
  }

  return { toegestaan: false, naar: null, onderwerpPrefix: '[STAGING] ', reden: 'geblokkeerd' };
}
