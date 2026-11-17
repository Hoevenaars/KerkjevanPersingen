import assert from 'node:assert/strict';
import test from 'node:test';
import { bewaarStukBeoordeling, leesStukBeoordelingen, type StukSessie } from '../src/lib/operatie/stuk-beoordeling-sessie.ts';
import {
  beoordeelStukActie,
  stukPaneel,
  verwachtStuk,
  type StukBeoordeling,
  type StukSleutel,
} from '../src/platform/stuk-beoordeling.ts';

const tekst: StukSleutel = { stukType: 'inhoud', stukId: 'tekst:17', versie: 2, aanwezig: true };

function besluit(deel: Partial<Parameters<typeof beoordeelStukActie>[0]> = {}) {
  return beoordeelStukActie({
    besluit: 'goedkeuren',
    stukType: 'inhoud',
    stukId: 'tekst:17',
    versie: '2',
    reden: '',
    verwacht: tekst,
    alBeoordeeld: false,
    ...deel,
  });
}

test('goedkeuren bindt de huidige versie en bewaart geen reden', () => {
  const uit = besluit();
  assert.equal(uit.ok, true);
  if (uit.ok) {
    assert.equal(uit.status, 'goedgekeurd');
    assert.equal(uit.reden, null);
    assert.equal(uit.sleutel.versie, 2);
  }
});

test('afkeuren zonder reden en een tweede keer dezelfde versie worden geweigerd', () => {
  const zonder = besluit({ besluit: 'afkeuren', reden: '  ' });
  assert.equal(zonder.ok, false);
  const opnieuw = besluit({ alBeoordeeld: true });
  assert.equal(opnieuw.ok, false);
  if (!opnieuw.ok) assert.match(opnieuw.melding, /al beoordeeld/);
});

test('een hogere versie is opnieuw te beoordelen en de oude beslissing blijft zichtbaar', () => {
  const oud: StukBeoordeling = {
    stukType: 'inhoud',
    stukId: 'tekst:17',
    versie: 1,
    status: 'goedgekeurd',
    reden: '',
    beoordelaar: 'Nick',
    beoordeeldOp: '2026-11-01T10:00:00.000Z',
  };
  const paneel = stukPaneel({
    sleutel: { ...tekst, versie: 2 },
    magSchrijven: true,
    demo: false,
    leesfout: '',
    beoordelingen: [oud],
  });
  assert.equal(paneel.status, 'te_beoordelen');
  assert.equal(paneel.kan, true);
  const opDeSite = stukPaneel({
    sleutel: { ...tekst, versie: 2 },
    magSchrijven: true,
    demo: false,
    leesfout: '',
    beoordelingen: [oud],
    opDeWebsite: true,
  });
  assert.equal(opDeSite.statusTekst, 'Goedgekeurd');
  assert.equal(opDeSite.kan, false);
  assert.equal(opDeSite.beoordelaar, 'Website');
  assert.match(opDeSite.toelichting, /website/);
  assert.match(paneel.eerdere, /Versie 1 is goedgekeurd/);
  assert.match(paneel.eerdere, /geldt niet voor versie 2/);
});

test('een opgeslagen beslissing zet de status en zet de knoppen uit', () => {
  const paneel = stukPaneel({
    sleutel: tekst,
    magSchrijven: true,
    demo: false,
    leesfout: '',
    opDeWebsite: true,
    beoordelingen: [{
      stukType: 'inhoud',
      stukId: 'tekst:17',
      versie: 2,
      status: 'afgekeurd',
      reden: 'De foto is onscherp.',
      beoordelaar: 'Nick',
      beoordeeldOp: '2026-11-15T09:00:00.000Z',
    }],
  });
  assert.equal(paneel.statusTekst, 'Afgekeurd');
  assert.equal(paneel.kleur, 'no');
  assert.equal(paneel.kan, false);
  assert.equal(paneel.beoordelaar, 'Nick');
  assert.equal(paneel.reden, 'De foto is onscherp.');
  assert.match(paneel.datum, /2026/);
});

test('een ander onderdeel of een oude versie hoort niet bij deze boeking', () => {
  const huidigeTekst = verwachtStuk({
    stukType: 'inhoud',
    stukId: 'tekst:17',
    activiteitId: '17',
    inhoudVersie: 0,
    heeftTekst: true,
    heeftFoto: false,
    documentIds: [],
    intakePaden: [],
  });
  assert.equal(huidigeTekst?.versie, 0);
  assert.equal(huidigeTekst?.aanwezig, true);
  assert.equal(verwachtStuk({
    stukType: 'inhoud',
    stukId: 'foto:17',
    activiteitId: '17',
    inhoudVersie: 0,
    heeftTekst: true,
    heeftFoto: false,
    documentIds: [],
    intakePaden: [],
  })?.aanwezig, false);
  const uit = besluit({ versie: '1' });
  assert.equal(uit.ok, false);
});

function sessie(opties: { uniek?: boolean; auditFout?: boolean } = {}): StukSessie & { tabellen: string[] } {
  const tabellen: string[] = [];
  return {
    tabellen,
    from(tabel) {
      tabellen.push(tabel);
      const query = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        insert() {
          if (tabel === 'stuk_beoordelingen' && opties.uniek) {
            return Promise.resolve({ error: { message: 'duplicate key value', code: '23505' } });
          }
          if (tabel === 'auditlog' && opties.auditFout) {
            return Promise.resolve({ error: { message: 'audit mislukt' } });
          }
          return Promise.resolve({ error: null });
        },
        then(resolve: (waarde: { data: never[]; error: null }) => unknown) {
          return Promise.resolve({ data: [], error: null }).then(resolve);
        },
      };
      return query;
    },
  };
}

test('opslaan schrijft alleen de beoordeling en de audit, niet een publicatie of betaling', async () => {
  const db = sessie();
  const uit = await bewaarStukBeoordeling(db, {
    boekingId: 17,
    stukType: 'inhoud',
    stukId: 'tekst:17',
    versie: 2,
    status: 'goedgekeurd',
    reden: null,
  }, { id: '11111111-1111-1111-1111-111111111111', naam: 'Nick', type: 'gebruiker' });
  assert.equal(uit.ok, true);
  assert.match(uit.melding, /Goedgekeurd voor versie 2/);
  assert.deepEqual(db.tabellen, ['stuk_beoordelingen', 'auditlog']);
});

test('dezelfde versie een tweede keer wijzigt niets', async () => {
  const db = sessie({ uniek: true });
  const uit = await bewaarStukBeoordeling(db, {
    boekingId: 17,
    stukType: 'inhoud',
    stukId: 'foto:17',
    versie: 0,
    status: 'afgekeurd',
    reden: 'Te donker',
  }, { id: '11111111-1111-1111-1111-111111111111', naam: 'Nick', type: 'gebruiker' });
  assert.equal(uit.ok, false);
  assert.deepEqual(db.tabellen, ['stuk_beoordelingen']);
});

test('lezen geeft de opgeslagen rijen terug', async () => {
  const client: StukSessie = {
    from() {
      const query = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        insert() {
          return Promise.resolve({ error: null });
        },
        then(resolve: (waarde: { data: Record<string, unknown>[]; error: null }) => unknown) {
          return Promise.resolve({
            data: [{
              stuk_type: 'inhoud',
              stuk_id: 'tekst:17',
              versie: 0,
              status: 'goedgekeurd',
              reden: null,
              beoordelaar_naam: 'Nick',
              beoordeeld_op: '2026-11-15T12:00:00.000Z',
            }],
            error: null,
          }).then(resolve);
        },
      };
      return query;
    },
  };
  const gelezen = await leesStukBeoordelingen(client, 17);
  assert.equal(gelezen.ok, true);
  if (gelezen.ok) {
    assert.equal(gelezen.rijen[0]?.versie, 0);
    assert.equal(gelezen.rijen[0]?.beoordelaar, 'Nick');
  }
});
