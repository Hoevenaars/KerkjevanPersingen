import assert from 'node:assert/strict';
import test from 'node:test';
import { hoortOpPubliekeAgenda, maandenVanTrigger, directeFotoUrl } from '../src/lib/agenda-zichtbaarheid.ts';

const basis = {
  gepubliceerd: false,
  inhoudStatus: 'niet_gestart' as const,
  eind: '2028-08-20',
  trigger: 'uiterlijk_12_maanden',
};

test('publieke Sanity-activiteit blijft op de agendaset zonder goedgekeurde content', () => {
  assert.equal(hoortOpPubliekeAgenda({ ...basis, zichtbaarheid: 'publiek' }, '2026-09-30'), true);
  assert.equal(maandenVanTrigger('uiterlijk_12_maanden'), '12');
  assert.equal(maandenVanTrigger('uiterlijk_3_maanden'), '3');
});

test('bezet en verborgen komen niet op de publieke agenda', () => {
  assert.equal(hoortOpPubliekeAgenda({ ...basis, zichtbaarheid: 'bezet' }, '2026-09-30'), false);
  assert.equal(hoortOpPubliekeAgenda({ ...basis, zichtbaarheid: 'verborgen' }, '2026-09-30'), false);
});

test('een directe url raakt de Sanity-assetbuilder niet', () => {
  assert.equal(directeFotoUrl('https://cdn.example.test/foto.jpg'), 'https://cdn.example.test/foto.jpg');
  assert.equal(directeFotoUrl('/foto/geen-foto.jpg'), '/foto/geen-foto.jpg');
  assert.equal(directeFotoUrl(null), null);
});
