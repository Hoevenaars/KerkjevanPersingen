import assert from 'node:assert/strict';
import test from 'node:test';
import { reservelijstDatum, reservelijstRegels } from '../src/platform/reservelijst-weergave.ts';

test('reservelijstdatum wordt een Amsterdamse kalenderdag', () => {
  assert.equal(reservelijstDatum(''), '');
  assert.equal(reservelijstDatum('2026-04-03'), '2026-04-03');
  assert.equal(reservelijstDatum('2026-04-03T22:30:00Z'), '2026-04-04');
  assert.equal(reservelijstDatum('geen datum'), '');
});

test('reserve lijst toont alleen wie erop staat, oudste datum eerst', () => {
  const regels = reservelijstRegels([
    { id: '2', naam: 'Zara', email: 'z@example.test', telefoon: '2', reservelijst: true, reservelijstSinds: '2026-06-01' },
    { id: '3', naam: 'Kim', email: 'k@example.test', telefoon: '', reservelijst: false },
    { id: '1', naam: 'Ada', email: 'a@example.test', telefoon: '1', reservelijst: true, reservelijstSinds: '2026-01-15T23:30:00Z' },
    { id: '4', naam: 'Bo', email: '', telefoon: '4', reservelijst: true },
  ]);
  assert.deepEqual(
    regels.map((regel) => regel.naam),
    ['Ada', 'Zara', 'Bo'],
  );
  assert.equal(regels[0]?.sinds, '2026-01-16');
  assert.equal(regels[2]?.sinds, '');
  assert.equal(regels[2]?.email, '');
});
