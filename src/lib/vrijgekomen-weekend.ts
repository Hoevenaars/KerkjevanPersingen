/**
 * Tijdelijke banner voor het onverwacht vrije expositieweekend van
 * 7 en 8 november 2026. De knop vult het aanvraagformulier al in
 * (expositie, zaterdag t/m zondag), zodat iemand niet zelf hoeft te zoeken.
 *
 * Staat op alle publieke pagina's behalve het aanvraagformulier zelf.
 * Na afloop van dat weekend verdwijnt de banner vanzelf — Nederlandse tijd,
 * dezelfde regel als de rest van de kalender.
 */

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

export function toonVrijgekomenWeekendBanner(nu = new Date()): boolean {
  const vandaag = nu.toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' });
  return vandaag <= VRIJGEKOMEN_EXPOSITIE_WEEKEND.zondag;
}

/** Op het aanvraagformulier zelf zou de banner alleen afleiden. */
export function toonVrijgekomenWeekendBannerOpPagina(
  pad: string,
  nu = new Date(),
): boolean {
  if (pad.startsWith('/verhuur/aanvragen')) return false;
  return toonVrijgekomenWeekendBanner(nu);
}
