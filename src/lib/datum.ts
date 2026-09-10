/**
 * Datums voor de publieke site, altijd in Nederlandse tijd.
 *
 * Zonder expliciete timeZone gebruikt toLocaleTimeString de tijdzone van de
 * server (Vercel = UTC). Dat gaf tot 2 uur verschil bij activiteiten met een
 * tijdstip.
 */

export function ymdAmsterdam(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' });
}

function utcMiddagVanYmd(ymd: string): Date {
  const [jaar, maand, dag] = ymd.split('-').map(Number);
  return new Date(Date.UTC(jaar, maand - 1, dag, 12, 0, 0));
}

function volgendeYmd(ymd: string): string {
  const d = utcMiddagVanYmd(ymd);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Kalenderdagen die een boeking blokkeert, in Nederlandse tijd.
 *
 * Sanity slaat datetimes in UTC op. Middernacht in Amsterdam is de avond
 * ervoor in UTC — zonder vaste tijdzone werd 8 november "bezet" op 7 november,
 * terwijl Studio (Amsterdam) 8 november toonde.
 *
 * Bij een zaterdag-expositie zonder aparte zondag telt zondag mee, net als in
 * de agenda-tekst (`eindVoorWeergave`).
 */
export function bezetteKalenderDagen(
  activiteiten: readonly {
    start?: string;
    eind?: string;
    soort?: string;
    zichtbaarheid?: string;
  }[],
): Set<string> {
  const dagen = new Set<string>();
  for (const item of activiteiten) {
    if (item.zichtbaarheid === 'verborgen') continue;
    if (!item.start || Number.isNaN(Date.parse(item.start))) continue;

    const startYmd = ymdAmsterdam(item.start);
    const eindIso = eindVoorWeergave({
      start: item.start,
      eind: item.eind,
      soort: item.soort,
    });
    if (Number.isNaN(Date.parse(eindIso))) continue;
    const eindYmd = ymdAmsterdam(eindIso);
    if (eindYmd < startYmd) continue;

    let loper = startYmd;
    let veiligheid = 0;
    while (loper <= eindYmd && veiligheid < 400) {
      dagen.add(loper);
      loper = volgendeYmd(loper);
      veiligheid++;
    }
  }
  return dagen;
}

function weekdagAmsterdam(iso: string): number {
  return utcMiddagVanYmd(ymdAmsterdam(iso)).getUTCDay();
}

export function formatDatum(iso: string, metTijd = true): string {
  const d = new Date(iso);
  const datum = d.toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Amsterdam',
  });
  if (!metTijd) return datum;
  const tijd = d.toLocaleTimeString('nl-NL', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Amsterdam',
  });
  return `${datum}, ${tijd} uur`;
}

/**
 * Einddatum voor weergave: bij een expositie die alleen op zaterdag is
 * ingevoerd, hoort zondag erbij. Exposities zijn in principe een heel weekend;
 * in het CMS staat bij "Eindtijd" vaak alleen 17.00 uur op zaterdag.
 *
 * Ook gebruikt voor Event JSON-LD (SEO), zodat structured data dezelfde
 * periode toont als de zichtbare tekst.
 */
export function eindVoorWeergave(activiteit: {start: string; eind?: string; soort?: string}): string {
  const fallback = activiteit.eind ?? activiteit.start;
  if (activiteit.soort !== 'expositie') return fallback;
  if (weekdagAmsterdam(activiteit.start) !== 6) return fallback;

  const startYmd = ymdAmsterdam(activiteit.start);
  const eindYmd = ymdAmsterdam(fallback);
  if (eindYmd !== startYmd) return fallback;

  const zondag = utcMiddagVanYmd(startYmd);
  zondag.setUTCDate(zondag.getUTCDate() + 1);
  return zondag.toISOString();
}

/**
 * Toont één datum, of een volledige periode (bijv. "zaterdag 15 en zondag 16
 * augustus 2026"). Zonder tweede kalenderdag gedraagt dit zich identiek aan
 * formatDatum(iso, false) — dus zonder tijd.
 *
 * Bij een expositie die op zaterdag begint en geen aparte zondag-datum heeft,
 * wordt zondag meegenomen. Bezoekers zien dan het hele weekend, niet alleen de
 * startdag.
 */
export function formatDatumBereik(activiteit: {
  start: string;
  eind?: string;
  soort?: string;
}): string {
  const eindIso = eindVoorWeergave(activiteit);
  const startYmd = ymdAmsterdam(activiteit.start);
  const eindYmd = ymdAmsterdam(eindIso);

  if (startYmd === eindYmd) return formatDatum(activiteit.start, false);

  const start = new Date(activiteit.start);
  const eind = new Date(eindIso);
  const [startJaar, startMaand] = startYmd.split('-');
  const [eindJaar, eindMaand] = eindYmd.split('-');
  const zelfdeMaand = startJaar === eindJaar && startMaand === eindMaand;

  const dagStart = start.toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    timeZone: 'Europe/Amsterdam',
  });
  const volledigEind = eind.toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Amsterdam',
  });

  if (zelfdeMaand) {
    return `${dagStart} en ${volledigEind}`;
  }

  const volledigStart = start.toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Amsterdam',
  });
  return `${volledigStart} t/m ${volledigEind}`;
}
