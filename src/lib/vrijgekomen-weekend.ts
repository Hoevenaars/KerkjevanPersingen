/**
 * Banner voor een onverwacht vrij expositieweekend.
 *
 * 7 en 8 november 2026 is weer vrij — de schakelaar staat aan.
 * Zet `VRIJGEKOMEN_WEEKEND_BANNER_AAN` op `false` om hem tijdelijk te verbergen
 * zonder component of copy te verwijderen. Bij een ander weekend: datums en
 * copy hieronder bijwerken.
 *
 * Staat op alle publieke pagina's behalve `/verhuur/aanvragen`.
 * Na afloop van dat weekend verdwijnt de banner vanzelf — Nederlandse tijd.
 */

/** Zet op `false` om de banner te verbergen zonder de code te verwijderen. */
export const VRIJGEKOMEN_WEEKEND_BANNER_AAN = true;

export const VRIJGEKOMEN_EXPOSITIE_WEEKEND = {
  zaterdag: '2026-11-07',
  zondag: '2026-11-08',
  eyebrow: 'Onverwacht vrij',
  titel: 'Een uniek expositieweekend is vrijgekomen',
  tekst:
    'Presenteer jouw werk in het Kerkje van Persingen. Dit weekend is nu beschikbaar — vraag het aan voordat het weer vergeven is.',
  knop: 'Vraag 7 en 8 november aan',
} as const;

export type WeekendDatumKaart = {
  ymd: string;
  weekdag: string;
  dag: string;
  maand: string;
};

function datumKaart(ymd: string): WeekendDatumKaart {
  const d = new Date(`${ymd}T12:00:00Z`);
  return {
    ymd,
    weekdag: d.toLocaleDateString('nl-NL', { weekday: 'long', timeZone: 'UTC' }),
    dag: d.toLocaleDateString('nl-NL', { day: 'numeric', timeZone: 'UTC' }),
    maand: d.toLocaleDateString('nl-NL', { month: 'short', timeZone: 'UTC' }),
  };
}

export function weekendDatumKaarten(): [WeekendDatumKaart, WeekendDatumKaart] {
  const { zaterdag, zondag } = VRIJGEKOMEN_EXPOSITIE_WEEKEND;
  return [datumKaart(zaterdag), datumKaart(zondag)];
}

export function aanvraagPadVrijgekomenWeekend(): string {
  const { zaterdag, zondag } = VRIJGEKOMEN_EXPOSITIE_WEEKEND;
  return `/verhuur/aanvragen/?datum=${zaterdag}&datumTot=${zondag}&soort=expositie`;
}

/** Of het weekend in de copy nog in de toekomst of gaande is. */
export function weekendNogBeschikbaar(nu = new Date()): boolean {
  const vandaag = nu.toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' });
  return vandaag <= VRIJGEKOMEN_EXPOSITIE_WEEKEND.zondag;
}

export function toonVrijgekomenWeekendBanner(nu = new Date()): boolean {
  if (!VRIJGEKOMEN_WEEKEND_BANNER_AAN) return false;
  return weekendNogBeschikbaar(nu);
}

/** Op het aanvraagformulier zelf zou de banner alleen afleiden. */
export function toonVrijgekomenWeekendBannerOpPagina(
  pad: string,
  nu = new Date(),
): boolean {
  if (pad.startsWith('/verhuur/aanvragen')) return false;
  return toonVrijgekomenWeekendBanner(nu);
}
