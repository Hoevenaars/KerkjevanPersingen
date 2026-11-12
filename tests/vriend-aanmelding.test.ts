import assert from 'node:assert/strict';
import test from 'node:test';
import { leesVriendAanmelding } from '../src/lib/vriend-aanmelding.ts';

const vandaag = '2026-11-11';

const geldig = {
  voornaam: '  Nelleke ',
  achternaam: "van der Pol",
  email: 'Nelleke@Example.test',
  telefoon: '06 12 34 56 78',
  geboortedatum: '1980-03-02',
  toestemming: 'ja',
};

test('aanmelding maakt voor- en achternaam verplicht en bewaart optionele velden', () => {
  const uit = leesVriendAanmelding(geldig, vandaag);
  assert.equal(uit.ok, true);
  if (!uit.ok) return;
  assert.equal(uit.aanmelding.voornaam, 'Nelleke');
  assert.equal(uit.aanmelding.achternaam, 'van der Pol');
  assert.equal(uit.aanmelding.email, 'nelleke@example.test');
  assert.equal(uit.aanmelding.telefoon, '0612345678');
  assert.equal(uit.aanmelding.geboortedatum, '1980-03-02');
});

test('telefoon, geboortedatum en toestemming volgen de afspraak', () => {
  const zonderExtra = leesVriendAanmelding({ ...geldig, telefoon: '  ', geboortedatum: '' }, vandaag);
  assert.equal(zonderExtra.ok, true);
  if (zonderExtra.ok) {
    assert.equal(zonderExtra.aanmelding.telefoon, null);
    assert.equal(zonderExtra.aanmelding.geboortedatum, null);
  }

  assert.equal(leesVriendAanmelding({ ...geldig, voornaam: '' }, vandaag).ok, false);
  assert.equal(leesVriendAanmelding({ ...geldig, achternaam: '123' }, vandaag).ok, false);
  assert.equal(leesVriendAanmelding({ ...geldig, email: 'geen-adres' }, vandaag).ok, false);
  assert.equal(leesVriendAanmelding({ ...geldig, telefoon: '123' }, vandaag).ok, false);
  assert.equal(leesVriendAanmelding({ ...geldig, geboortedatum: '1980-02-31' }, vandaag).ok, false);
  assert.equal(leesVriendAanmelding({ ...geldig, geboortedatum: '2026-12-01' }, vandaag).ok, false);
  assert.equal(leesVriendAanmelding({ ...geldig, toestemming: '' }, vandaag).ok, false);
});
