import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activiteitenOpWebsite, type WebsiteAgendaBron } from '../src/platform/website-agenda.ts';

const vandaag = '2026-11-11';

function item(over: Partial<WebsiteAgendaBron> & Pick<WebsiteAgendaBron, 'titel' | 'start' | 'eind'>): WebsiteAgendaBron {
  return {
    tabel: 'publieke_activiteiten',
    publicatiestatus: 'publiek',
    levenscyclus: 'actief',
    trigger: 'direct',
    ...over,
  };
}

test('website-agenda toont alleen wat nu op de site staat', () => {
  const lijst = [
    item({ titel: 'Later', start: '2027-06-01', eind: '2027-06-02' }),
    item({ titel: 'Verborgen', start: '2026-11-14', eind: '2026-11-15', publicatiestatus: 'verborgen' }),
    item({ titel: 'Bezet', start: '2026-11-14', eind: '2026-11-15', publicatiestatus: 'bezet' }),
    item({ titel: 'Afgelopen', start: '2026-10-01', eind: '2026-10-02' }),
    item({ titel: 'Geannuleerd', start: '2026-11-21', eind: '2026-11-22', levenscyclus: 'geannuleerd' }),
    item({ titel: 'Bron', start: '2026-11-14', eind: '2026-11-15', tabel: 'activiteit_bron' }),
    item({ titel: 'Zondag', start: '2026-11-22', eind: '2026-11-22' }),
    item({ titel: 'Nu', start: '2026-11-14', eind: '2026-11-15' }),
  ];
  assert.deepEqual(
    activiteitenOpWebsite(lijst, vandaag, new Date('2026-11-11T12:00:00+01:00')).map((regel) => regel.titel),
    ['Nu', 'Zondag'],
  );
});
