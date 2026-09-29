/**
 * Projectconfiguratie voor de publieke site van het Kerkje van Persingen.
 * De meet- en rapportagelogica staat in `src/analytics` en hoort hier niet.
 */

import type { AnalyticsConfig } from '../analytics/types.ts';
import { TIJDZONE } from './types.ts';

/** Canonieke domeinen plus de redirect-domeinen uit de siteconfiguratie. */
export const OWN_DOMAINS = [
  'kerkjepersingen.nl',
  'kerkjevanpersingen.com',
  'persingen-verhuur.nl',
  'persingen-cultuur.nl',
  'hetkerkjevanpersingen.nl',
  'localhost',
  '127.0.0.1',
] as const;

const PAGINA_SLEUTELS: Record<string, string> = {
  '/': 'home',
  '/contact': 'contact',
  '/steun-ons': 'steun-ons',
  '/privacyverklaring': 'privacy',
  '/organisatie': 'organisatie',
  '/agenda': 'agenda',
  '/verhuur': 'verhuur',
  '/verhuur/voorwaarden': 'verhuur-voorwaarden',
  '/verhuur/aanvragen': 'aanvraag',
  '/verhuur/aanvragen/bedankt': 'aanvraag-bedankt',
  '/het-kerkje': 'het-kerkje',
  '/het-kerkje/geschiedenis': 'geschiedenis',
  '/het-kerkje/omgeving': 'omgeving',
  '/vrienden/aanmelden': 'vrienden-aanmelden',
  '/vrienden/afmelden': 'vrienden-afmelden',
};

const ACTIVITEIT = /^\/agenda\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const kerkjeAnalytics: AnalyticsConfig = {
  ownDomains: OWN_DOMAINS,
  supportedLocales: ['nl'],
  timeZone: TIJDZONE,
  resolveLocale(pathname) {
    return resolvePageKey(pathname) ? 'nl' : null;
  },
  resolvePageKey,
  pageLabels: {
    home: 'Home',
    contact: 'Contact',
    'steun-ons': 'Steun ons',
    privacy: 'Privacyverklaring',
    organisatie: 'Organisatie',
    agenda: 'Agenda',
    'agenda-item': 'Activiteit',
    verhuur: 'Verhuur',
    'verhuur-voorwaarden': 'Verhuurvoorwaarden',
    aanvraag: 'Aanvraagformulier',
    'aanvraag-bedankt': 'Aanvraag ontvangen',
    'het-kerkje': 'Het kerkje',
    geschiedenis: 'Geschiedenis',
    omgeving: 'Omgeving',
    'vrienden-aanmelden': 'Vrienden aanmelden',
    'vrienden-afmelden': 'Vrienden afmelden',
  },
  localeLabels: {
    nl: 'Nederlands',
  },
  referrerLabels: {
    'google.com': 'Google',
    'google.nl': 'Google',
    'facebook.com': 'Facebook',
    'instagram.com': 'Instagram',
    'linkedin.com': 'LinkedIn',
    'bing.com': 'Bing',
    'duckduckgo.com': 'DuckDuckGo',
  },
};

export function resolvePageKey(pathname: string): string | null {
  const exact = PAGINA_SLEUTELS[pathname];
  if (exact) return exact;
  if (ACTIVITEIT.test(pathname)) return 'agenda-item';
  return null;
}
