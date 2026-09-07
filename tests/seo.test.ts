import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { eventJsonLd, venueJsonLd, VENUE } from '../src/lib/seo.ts';

describe('venueJsonLd', () => {
  test('bevat volledig adres, geo en sameAs voor lokale SEO', () => {
    const ld = venueJsonLd();
    assert.deepEqual(ld['@type'], ['HistoricalLandmark', 'EventVenue']);
    assert.equal(ld.address.streetAddress, 'Persingensestraat 7');
    assert.equal(ld.address.postalCode, '6575 JA');
    assert.equal(ld.address.addressRegion, 'Gelderland');
    assert.equal(ld.geo.latitude, VENUE.geo.latitude);
    assert.equal(ld.geo.longitude, VENUE.geo.longitude);
    assert.ok(Array.isArray(ld.sameAs) && ld.sameAs[0].includes('facebook.com'));
    assert.ok(ld.hasMap.includes('openstreetmap.org'));
  });
});

describe('eventJsonLd', () => {
  test('expositie wordt ExhibitionEvent met weekend-einddatum', () => {
    const ld = eventJsonLd({
      publiekeTitel: 'Groepsexpositie',
      start: '2026-08-15T09:00:00.000Z',
      eind: '2026-08-15T15:00:00.000Z',
      soort: 'expositie',
      slug: 'groepsexpositie',
    });
    assert.equal(ld['@type'], 'ExhibitionEvent');
    assert.equal(ld.startDate, '2026-08-15T09:00:00.000Z');
    // Zondag meegenomen (zelfde regel als zichtbare datums)
    assert.match(ld.endDate, /^2026-08-16/);
    assert.equal(ld.location.address.streetAddress, 'Persingensestraat 7');
    assert.equal(ld.location.geo.latitude, VENUE.geo.latitude);
    assert.equal(ld.url, 'https://kerkjepersingen.nl/agenda/groepsexpositie/');
  });

  test('concert wordt MusicEvent', () => {
    const ld = eventJsonLd({
      publiekeTitel: 'Orgelconcert',
      start: '2026-09-12T18:00:00.000Z',
      eind: '2026-09-12T20:00:00.000Z',
      soort: 'concert',
      slug: 'orgelconcert',
      imageUrl: '/foto/voorbeeld.jpg',
    });
    assert.equal(ld['@type'], 'MusicEvent');
    assert.equal(ld.image, 'https://kerkjepersingen.nl/foto/voorbeeld.jpg');
  });
});
