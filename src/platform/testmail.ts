/**
 * Centraal testmailadres en de harde TEST-regel.
 * De ontvanger wordt server-side bepaald. Een formulierwaarde is geen beveiliging.
 */

export const TESTMAIL_SLEUTEL = 'testmailadres';
export const STANDAARD_TESTMAILADRES = 'nhoevenaars@gmail.com';
export const TEST_ONDERWERP_PREFIX = '[TEST] ';
export const GEEN_TESTMAILADRES = 'Geen geldig testmailadres ingesteld.';

export type Mailmodus = 'uit' | 'dry-run' | 'test' | 'aan';

const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

export function normaliseerTestmailadres(
  ruw: unknown,
): { ok: true; adres: string } | { ok: false; reden: 'leeg' | 'lijst' | 'ongeldig' } {
  if (ruw == null) return { ok: false, reden: 'leeg' };
  const tekst = String(ruw).trim();
  if (!tekst) return { ok: false, reden: 'leeg' };
  if (/[,;\s]/.test(tekst)) return { ok: false, reden: 'lijst' };
  if (!EMAIL.test(tekst)) return { ok: false, reden: 'ongeldig' };
  return { ok: true, adres: tekst.toLowerCase() };
}

export interface ProviderBrief {
  to: readonly string[];
  cc?: readonly string[];
  bcc?: readonly string[];
  subject: string;
  replyTo?: string;
  bedoeldeOntvanger: string;
}

export interface Testbrief {
  ok: true;
  to: [string];
  cc: [];
  bcc: [];
  subject: string;
  replyTo?: string;
  bedoeldeOntvanger: string;
  werkelijkeOntvanger: string;
}

export function pasTestmodusToe(
  brief: ProviderBrief,
  testadres: string | null | undefined,
): Testbrief | { ok: false; reden: string } {
  const check = normaliseerTestmailadres(testadres);
  if (!check.ok) return { ok: false, reden: GEEN_TESTMAILADRES };
  const subject = brief.subject.startsWith(TEST_ONDERWERP_PREFIX)
    ? brief.subject
    : `${TEST_ONDERWERP_PREFIX}${brief.subject}`;
  return {
    ok: true,
    to: [check.adres],
    cc: [],
    bcc: [],
    subject,
    replyTo: brief.replyTo,
    bedoeldeOntvanger: brief.bedoeldeOntvanger,
    werkelijkeOntvanger: check.adres,
  };
}

export function providerPayloadIsTestveilig(
  payload: { to: readonly string[]; cc?: readonly string[]; bcc?: readonly string[]; subject: string },
  testadres: string,
): boolean {
  const norm = testadres.trim().toLowerCase();
  const to = payload.to.map((adres) => adres.trim().toLowerCase());
  if (to.length !== 1 || to[0] !== norm) return false;
  if ((payload.cc?.length ?? 0) > 0 || (payload.bcc?.length ?? 0) > 0) return false;
  return payload.subject.startsWith(TEST_ONDERWERP_PREFIX);
}

/** jsonb-waarde uit instellingen naar platte tekst, zonder de JSON-aanhalingstekens. */
export function tekstUitInstelling(waarde: unknown): string {
  if (typeof waarde === 'string') {
    const schoon = waarde.trim();
    if (schoon.startsWith('"') && schoon.endsWith('"')) {
      try {
        const parsed = JSON.parse(schoon);
        return typeof parsed === 'string' ? parsed : schoon;
      } catch {
        return schoon;
      }
    }
    return schoon;
  }
  if (waarde == null) return '';
  return String(waarde).trim();
}
