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
