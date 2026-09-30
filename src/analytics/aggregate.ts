import { DEVICE_TYPES, type AnalyticsConfig, type DeviceType, type PageViewRecord, type Periode, type WebsiteTrafficStats } from './types.ts';
import { dagenInPeriode, ymdInTijdzone } from './periode.ts';

function aandeel(deel: number, totaal: number): number {
  if (totaal <= 0 || deel <= 0) return 0;
  return Math.round((deel / totaal) * 1000) / 10;
}

function labelVoor(config: AnalyticsConfig, pageKey: string): string {
  return config.pageLabels[pageKey] ?? pageKey;
}

function localeLabel(config: AnalyticsConfig, locale: string): string {
  return config.localeLabels[locale] ?? locale;
}

function verwijzerLabel(config: AnalyticsConfig, host: string | null): string {
  if (!host) return 'Direct';
  return config.referrerLabels?.[host] ?? host;
}

/**
 * Eén rapportagedefinitie voor totalen, dagen, pagina's, talen, apparaten en verwijzers.
 * Rijen buiten de periode tellen niet mee. Lege invoer geeft nullen, geen fout.
 */
export function aggregeerPageviews(
  rijen: readonly PageViewRecord[],
  periode: Periode,
  config: AnalyticsConfig,
): WebsiteTrafficStats {
  const binnen = rijen.filter((rij) => {
    const tijdstip = new Date(rij.createdAt);
    return !Number.isNaN(tijdstip.getTime()) && tijdstip >= periode.vanaf && tijdstip < periode.totExclusief;
  });

  const totaal = binnen.length;
  const perDag = new Map<string, number>();
  for (const datum of dagenInPeriode(periode.van, periode.tot)) perDag.set(datum, 0);

  const perPagina = new Map<string, { pageviews: number; paden: Map<string, number> }>();
  const perLocale = new Map<string, number>();
  for (const locale of config.supportedLocales) perLocale.set(locale, 0);
  const perApparaat = new Map<DeviceType, number>();
  for (const deviceType of DEVICE_TYPES) perApparaat.set(deviceType, 0);
  const perVerwijzer = new Map<string | null, number>();

  for (const rij of binnen) {
    const dag = ymdInTijdzone(new Date(rij.createdAt), config.timeZone);
    if (perDag.has(dag)) perDag.set(dag, (perDag.get(dag) ?? 0) + 1);

    const pagina = perPagina.get(rij.pageKey) ?? { pageviews: 0, paden: new Map<string, number>() };
    pagina.pageviews += 1;
    pagina.paden.set(rij.path, (pagina.paden.get(rij.path) ?? 0) + 1);
    perPagina.set(rij.pageKey, pagina);

    perLocale.set(rij.locale, (perLocale.get(rij.locale) ?? 0) + 1);
    if (perApparaat.has(rij.deviceType)) perApparaat.set(rij.deviceType, (perApparaat.get(rij.deviceType) ?? 0) + 1);
    perVerwijzer.set(rij.referrerHost, (perVerwijzer.get(rij.referrerHost) ?? 0) + 1);
  }

  const paginas = [...perPagina.entries()]
    .map(([pageKey, waarde]) => {
      let path = '';
      let hoogste = -1;
      for (const [pad, aantal] of waarde.paden) {
        if (aantal > hoogste) {
          hoogste = aantal;
          path = pad;
        }
      }
      return {
        pageKey,
        label: labelVoor(config, pageKey),
        path,
        meerderePaden: waarde.paden.size > 1,
        pageviews: waarde.pageviews,
        aandeel: aandeel(waarde.pageviews, totaal),
      };
    })
    .sort((a, b) => b.pageviews - a.pageviews || a.label.localeCompare(b.label, 'nl'));

  const locales = [...perLocale.entries()]
    .filter(([, pageviews]) => pageviews > 0)
    .map(([locale, pageviews]) => ({
      locale,
      label: localeLabel(config, locale),
      pageviews,
      aandeel: aandeel(pageviews, totaal),
    }))
    .sort((a, b) => b.pageviews - a.pageviews || a.label.localeCompare(b.label, 'nl'));

  const apparaten = DEVICE_TYPES.map((deviceType) => ({
    deviceType,
    pageviews: totaal === 0 ? 0 : (perApparaat.get(deviceType) ?? 0),
    aandeel: aandeel(perApparaat.get(deviceType) ?? 0, totaal),
  })).filter((rij) => totaal > 0);

  const verwijzers = [...perVerwijzer.entries()]
    .map(([host, pageviews]) => ({
      host,
      label: verwijzerLabel(config, host),
      pageviews,
      aandeel: aandeel(pageviews, totaal),
    }))
    .sort((a, b) => b.pageviews - a.pageviews || a.label.localeCompare(b.label, 'nl'));

  const gemiddeldPerDag = Math.round((totaal / periode.dagen) * 10) / 10;

  return {
    periode: { dagen: periode.dagen, van: periode.van, tot: periode.tot },
    totalen: { pageviews: totaal, gemiddeldPerDag },
    dagelijks: [...perDag.entries()].map(([datum, pageviews]) => ({ datum, pageviews })),
    paginas,
    locales,
    apparaten,
    verwijzers,
  };
}
