import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  bouwSitemap,
  canoniekUrl,
  eventJsonLd,
  isStandaardOgBeeld,
  jsonLdInScript,
  metaTekst,
  robotsBody,
  venueJsonLd,
  VENUE,
} from '../src/lib/seo.ts';

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

  test('JSON-LD in een script sluit de tag niet via CMS-tekst', () => {
    const ruw = jsonLdInScript({ name: '</script><script>alert(1)</script>' });
    assert.equal(ruw.includes('<'), false);
    assert.equal(JSON.parse(ruw).name, '</script><script>alert(1)</script>');
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

describe('canonieke URL', () => {
  test('met en zonder slash wijzen naar dezelfde pagina', () => {
    assert.equal(canoniekUrl('/contact'), 'https://kerkjepersingen.nl/contact/');
    assert.equal(canoniekUrl('/contact/'), 'https://kerkjepersingen.nl/contact/');
    assert.equal(canoniekUrl('/'), 'https://kerkjepersingen.nl/');
    assert.equal(canoniekUrl('/agenda/voorbeeld'), 'https://kerkjepersingen.nl/agenda/voorbeeld/');
  });

  test('meta wordt één regel', () => {
    assert.equal(metaTekst('  zin\n\nmet   wit  '), 'zin met wit');
  });

  test('og-afmetingen alleen voor het vaste beeld', () => {
    assert.equal(isStandaardOgBeeld('/og-default.jpg'), true);
    assert.equal(isStandaardOgBeeld('https://example.invalid/images/x.jpg'), false);
  });
});

describe('sitemap en robots', () => {
  test('sitemap heeft geen verzonnen lastmod en escapet locaties', () => {
    const xml = bouwSitemap([{ pad: '/agenda/a&b/', prioriteit: '0.5' }]);
    assert.equal(xml.includes('lastmod'), false);
    assert.ok(xml.includes('<loc>https://kerkjepersingen.nl/agenda/a&amp;b/</loc>'));
    assert.ok(xml.includes('<priority>0.5</priority>'));
  });

  test('elke crawler houdt privépaden dicht', () => {
    const body = robotsBody(false);
    for (const agent of ['*', 'GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'Applebot-Extended']) {
      const stuk = body.split(`User-agent: ${agent}\n`)[1] ?? '';
      const groep = stuk.split('\n\n')[0] ?? '';
      assert.equal(groep.includes('User-agent:'), false, `${agent} loopt door in het volgende blok`);
      for (const pad of ['/api/', '/vrienden/', '/admin', '/beheer', '/klant']) {
        assert.ok(groep.includes(`Disallow: ${pad}`), `${agent} mist ${pad}`);
      }
    }
    assert.match(body, /Sitemap: https:\/\/kerkjepersingen\.nl\/sitemap\.xml/);
  });

  test('afgeschermde site blijft volledig dicht', () => {
    const body = robotsBody(true);
    assert.match(body, /Disallow: \/\n/);
    assert.equal(body.includes('Sitemap:'), false);
    assert.equal(body.includes('Allow: /'), false);
  });
});
