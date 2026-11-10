import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles/beheer-concept.css', import.meta.url), 'utf8');
const schil = readFileSync(new URL('../src/layouts/BeheerSchil.astro', import.meta.url), 'utf8');
const beheer = readFileSync(new URL('../src/layouts/Beheer.astro', import.meta.url), 'utf8');
const concept = readFileSync(new URL('../src/layouts/BeheerConcept.astro', import.meta.url), 'utf8');

describe('gedeelde beheerschil', () => {
  test('de inhoudsbreedte staat op één plek en is de maat van de verhuuragenda', () => {
    const definities = css.match(/--beheer-breedte:\s*1450px/g) ?? [];
    assert.equal(definities.length, 1);
    assert.equal(css.includes('max-width: 1450px'), false);
    assert.match(css, /\.kc-balk-binnen[\s\S]*max-width:\s*var\(--beheer-breedte\)/);
    assert.match(css, /\.kc-pagina[\s\S]*max-width:\s*var\(--beheer-breedte\)/);
    assert.match(css, /\.kc-subbalk-rij[\s\S]*max-width:\s*var\(--beheer-breedte\)/);
    assert.match(css, /scrollbar-gutter:\s*stable/);
  });

  test('verhuur, website en de overige beheerpagina\'s delen dezelfde schil', () => {
    assert.match(concept, /BeheerSchil/);
    assert.match(beheer, /BeheerSchil/);
    assert.match(schil, /data-beheer-schil/);
    assert.match(schil, /data-beheer-balk/);
    assert.match(beheer, /data-beheer-pagina/);
  });

  test('knoppen, velden en tabellen volgen de verhuurmaten', () => {
    assert.match(css, /\.kc \.bh-btn[\s\S]*min-height:\s*48px/);
    assert.match(css, /\.kc \.bh-btn--gevaar/);
    assert.match(css, /\.kc \.bh-form input[\s\S]*min-height:\s*52px/);
    assert.match(css, /\.kc \.bh-tabel[\s\S]*min-width:\s*40rem/);
  });
});
