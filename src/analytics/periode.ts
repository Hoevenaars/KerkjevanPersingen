import { PERIODE_DAGEN, type Periode, type PeriodeDagen } from './types.ts';

export function ymdInTijdzone(datum: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(datum);
}

function voegDagenToe(ymd: string, dagen: number): string {
  const [jaar, maand, dag] = ymd.split('-').map(Number);
  const d = new Date(Date.UTC(jaar, maand - 1, dag + dagen, 12, 0, 0));
  return d.toISOString().slice(0, 10);
}

/** Middernacht van een kalenderdag in `timeZone`, als UTC-instant. */
export function startVanDag(ymd: string, timeZone: string): Date {
  const [jaar, maand, dag] = ymd.split('-').map(Number);
  let utc = Date.UTC(jaar, maand - 1, dag, 0, 0, 0);
  for (let i = 0; i < 4; i += 1) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(new Date(utc));
    const lees = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((deel) => deel.type === type)?.value);
    let uur = lees('hour');
    let dagDeel = lees('day');
    let maandDeel = lees('month');
    let jaarDeel = lees('year');
    if (uur === 24) {
      uur = 0;
      const volgende = new Date(Date.UTC(jaarDeel, maandDeel - 1, dagDeel + 1));
      jaarDeel = volgende.getUTCFullYear();
      maandDeel = volgende.getUTCMonth() + 1;
      dagDeel = volgende.getUTCDate();
    }
    const getoond = Date.UTC(jaarDeel, maandDeel - 1, dagDeel, uur, lees('minute'), lees('second'));
    const doel = Date.UTC(jaar, maand - 1, dag, 0, 0, 0);
    const verschil = doel - getoond;
    if (verschil === 0) break;
    utc += verschil;
  }
  return new Date(utc);
}

export function isPeriodeDagen(waarde: number): waarde is PeriodeDagen {
  return (PERIODE_DAGEN as readonly number[]).includes(waarde);
}

export function periodeVan(dagen: PeriodeDagen, nu: Date, timeZone: string): Periode {
  const tot = ymdInTijdzone(nu, timeZone);
  const van = voegDagenToe(tot, -(dagen - 1));
  return {
    dagen,
    van,
    tot,
    vanaf: startVanDag(van, timeZone),
    totExclusief: startVanDag(voegDagenToe(tot, 1), timeZone),
  };
}

/** Onbekende waarden vallen terug op 30 dagen. */
export function leesPeriode(waarde: string | null | undefined, nu: Date, timeZone: string): Periode {
  const getal = Number(waarde);
  const dagen: PeriodeDagen = isPeriodeDagen(getal) ? getal : 30;
  return periodeVan(dagen, nu, timeZone);
}

const MAX_PERIODE_DAGEN = 366;

function isKalenderdag(ymd: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const [jaar, maand, dag] = ymd.split('-').map(Number);
  const datum = new Date(Date.UTC(jaar, maand - 1, dag));
  return datum.getUTCFullYear() === jaar && datum.getUTCMonth() === maand - 1 && datum.getUTCDate() === dag;
}

/**
 * Een eigen bereik, begrensd op vandaag en op één jaar.
 * Ongeldige dagen of een begin na vandaag geven null.
 */
export function periodeTussen(van: string, tot: string, nu: Date, timeZone: string): Periode | null {
  if (!isKalenderdag(van) || !isKalenderdag(tot) || tot < van) return null;
  const vandaag = ymdInTijdzone(nu, timeZone);
  if (van > vandaag) return null;
  const einde = tot > vandaag ? vandaag : tot;
  const lijst = dagenInPeriode(van, einde);
  if (lijst.length === 0 || lijst.length > MAX_PERIODE_DAGEN) return null;
  return {
    dagen: lijst.length,
    van,
    tot: einde,
    vanaf: startVanDag(van, timeZone),
    totExclusief: startVanDag(voegDagenToe(einde, 1), timeZone),
  };
}

/** Even lange periode die direct vóór `periode` eindigt. */
export function periodeErvoor(periode: Periode, timeZone: string): Periode {
  const van = voegDagenToe(periode.van, -periode.dagen);
  const tot = voegDagenToe(periode.van, -1);
  return {
    dagen: periode.dagen,
    van,
    tot,
    vanaf: startVanDag(van, timeZone),
    totExclusief: startVanDag(periode.van, timeZone),
  };
}

/** Een geldig van/tot wint van het vaste aantal dagen. */
export function leesVerkeerPeriode(
  invoer: { periode?: string | null; van?: string | null; tot?: string | null },
  nu: Date,
  timeZone: string,
): { periode: Periode; eigen: boolean } {
  const van = invoer.van?.trim() ?? '';
  const tot = invoer.tot?.trim() ?? '';
  if (van || tot) {
    const eigen = periodeTussen(van, tot, nu, timeZone);
    if (eigen) return { periode: eigen, eigen: true };
  }
  return { periode: leesPeriode(invoer.periode, nu, timeZone), eigen: false };
}

export function dagenInPeriode(van: string, tot: string): string[] {
  if (tot < van) return [];
  const dagen: string[] = [];
  let loper = van;
  let veiligheid = 0;
  while (loper <= tot && veiligheid < 400) {
    dagen.push(loper);
    loper = voegDagenToe(loper, 1);
    veiligheid += 1;
  }
  return dagen;
}
