/**
 * SEO- en GEO-gegevens die op meerdere plekken hetzelfde moeten zijn:
 * JSON-LD in Base.astro, Event-markup op agenda-detail, en llms.txt.
 *
 * Coördinaten: OpenStreetMap/Nominatim voor Persingensestraat 7, Persingen
 * (place_id 110103022). Adres gelijk aan wat op /organisatie/ en in de footer staat.
 */

import { eindVoorWeergave } from './datum.ts';

export const SITE_URL = 'https://kerkjepersingen.nl';

export const FACEBOOK_URL =
  'https://www.facebook.com/profile.php?id=100082161927118&locale=nl_NL';

export const VENUE = {
  name: 'Kerkje van Persingen',
  description:
    'Rijksmonumentaal kerkje uit circa 1350 in de Ooijpolder, te huur voor bruiloften, exposities, concerten en bijeenkomsten.',
  telephone: '+31652668449',
  image: `${SITE_URL}/og-default.jpg`,
  address: {
    '@type': 'PostalAddress' as const,
    streetAddress: 'Persingensestraat 7',
    postalCode: '6575 JA',
    addressLocality: 'Persingen',
    addressRegion: 'Gelderland',
    addressCountry: 'NL',
  },
  geo: {
    '@type': 'GeoCoordinates' as const,
    latitude: 51.8410785,
    longitude: 5.9175163,
  },
};

/** Breedte/hoogte van public/og-default.jpg — nodig voor consistente social previews. */
export const OG_IMAGE = {
  pad: '/og-default.jpg',
  width: 1200,
  height: 630,
};

export function venueJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': ['HistoricalLandmark', 'EventVenue'],
    name: VENUE.name,
    description: VENUE.description,
    url: SITE_URL,
    telephone: VENUE.telephone,
    image: VENUE.image,
    address: VENUE.address,
    geo: VENUE.geo,
    hasMap: `https://www.openstreetmap.org/?mlat=${VENUE.geo.latitude}&mlon=${VENUE.geo.longitude}#map=18/${VENUE.geo.latitude}/${VENUE.geo.longitude}`,
    sameAs: [FACEBOOK_URL],
    isAccessibleForFree: false,
    publicAccess: true,
  };
}

const EVENT_TYPE: Record<string, string> = {
  expositie: 'ExhibitionEvent',
  concert: 'MusicEvent',
};

export function eventJsonLd(activiteit: {
  publiekeTitel?: string;
  omschrijving?: string;
  start: string;
  eind?: string;
  soort?: string;
  slug: string;
  imageUrl?: string | null;
}) {
  const naam = activiteit.publiekeTitel ?? 'Activiteit';
  const type = (activiteit.soort && EVENT_TYPE[activiteit.soort]) || 'Event';

  return {
    '@context': 'https://schema.org',
    '@type': type,
    name: naam,
    description:
      activiteit.omschrijving?.slice(0, 300) ??
      `${naam} in het kerkje van Persingen.`,
    startDate: activiteit.start,
    endDate: eindVoorWeergave(activiteit),
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
    url: `${SITE_URL}/agenda/${activiteit.slug}/`,
    image: activiteit.imageUrl ? absolutiseer(activiteit.imageUrl) : VENUE.image,
    location: {
      '@type': 'EventVenue',
      name: VENUE.name,
      address: VENUE.address,
      geo: VENUE.geo,
    },
    organizer: {
      '@type': 'NGO',
      name: 'Stichting Het Kerkje van Persingen',
      url: `${SITE_URL}/organisatie/`,
    },
  };
}

function absolutiseer(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return new URL(url, SITE_URL).href;
}
