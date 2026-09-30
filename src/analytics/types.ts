/**
 * Generieke types voor first-party pageview-analytics.
 *
 * Geen visitor-id, geen sessie, geen IP, geen user-agent.
 * Een record beschrijft een paginaweergave, niet een persoon.
 */

export const DEVICE_TYPES = ['desktop', 'mobile', 'tablet', 'unknown'] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

export const PERIODE_DAGEN = [7, 30, 90] as const;
export type PeriodeDagen = (typeof PERIODE_DAGEN)[number];

export interface AnalyticsConfig {
  /** Apex-domeinen van dit project. Subdomeinen tellen mee als eigen verkeer. */
  ownDomains: readonly string[];
  /** Alleen locales die de site echt aanbiedt. */
  supportedLocales: readonly string[];
  /** IANA-tijdzone voor daggrenzen in rapportages. */
  timeZone: string;
  /** Genormaliseerd pad → locale, of null als die niet bij een publieke pagina hoort. */
  resolveLocale: (pathname: string) => string | null;
  /** Genormaliseerd pad → stabiele paginasleutel, of null als het pad niet gemeten wordt. */
  resolvePageKey: (pathname: string) => string | null;
  pageLabels: Readonly<Record<string, string>>;
  localeLabels: Readonly<Record<string, string>>;
  referrerLabels?: Readonly<Record<string, string>>;
}

export interface PageViewOntwerp {
  path: string;
  pageKey: string;
  locale: string;
  deviceType: DeviceType;
  referrerHost: string | null;
}

/** Vorm die naar `page_views` gaat. Alleen deze velden. */
export interface PageViewInsert {
  path: string;
  page_key: string;
  locale: string;
  device_type: DeviceType;
  referrer_host: string | null;
}

export interface PageViewRecord {
  createdAt: string;
  path: string;
  pageKey: string;
  locale: string;
  deviceType: DeviceType;
  referrerHost: string | null;
}

export interface Periode {
  dagen: PeriodeDagen;
  van: string;
  tot: string;
  vanaf: Date;
  totExclusief: Date;
}

export interface WebsiteTrafficStats {
  periode: { dagen: PeriodeDagen; van: string; tot: string };
  totalen: { pageviews: number; gemiddeldPerDag: number };
  dagelijks: { datum: string; pageviews: number }[];
  paginas: {
    pageKey: string;
    label: string;
    path: string;
    meerderePaden: boolean;
    pageviews: number;
    aandeel: number;
  }[];
  locales: { locale: string; label: string; pageviews: number; aandeel: number }[];
  apparaten: { deviceType: DeviceType; pageviews: number; aandeel: number }[];
  verwijzers: { host: string | null; label: string; pageviews: number; aandeel: number }[];
}
