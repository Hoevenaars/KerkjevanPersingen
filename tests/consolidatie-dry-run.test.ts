import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { CONSOLIDATIE_VELDEN } from '../src/platform/consolidatie-mapping.ts';
import {
  consolidatieDryRun,
  normEmail,
  parseCsv,
  telefoonSleutel,
  type BestaandeRij,
  type ConsolidatiePakket,
} from '../src/platform/consolidatie-dry-run.ts';

function leegPakket(): ConsolidatiePakket {
  return {
    relaties: [],
    rollen: [],
    boekingen: [],
    betalingen: [],
    toewijzingen: [],
    blokkades: [],
    review: [],
    bronregels: 0,
    bronregelsPerBestand: [],
    bronregister: 0,
  };
}

describe('consolidatiemapping', () => {
  test('elk bronveld heeft een bestemming of een expliciete weigering', () => {
    const velden = new Set(CONSOLIDATIE_VELDEN.map((veld) => `${veld.bronBestand}:${veld.bronVeld}`));
    for (const veld of ['relatie_id', 'email', 'review_status', 'geboortedatum']) {
      assert.equal(velden.has(`relaties.csv:${veld}`), true);
    }
    assert.equal(CONSOLIDATIE_VELDEN.some((veld) => veld.bronVeld === 'datum_suggestie' && veld.doelVeld === '(geen)'), true);
    assert.equal(CONSOLIDATIE_VELDEN.some((veld) => veld.bronVeld === 'cont_raw' && veld.doelTabel === 'domeinrij'), true);
  });
});

describe('normalisatie', () => {
  test('e-mail en telefoon zijn exact, niet fuzzy', () => {
    assert.equal(normEmail('  A@B.NL '), 'a@b.nl');
    assert.equal(telefoonSleutel('06-12 34 56 78'), telefoonSleutel('+31612345678'));
    assert.equal(telefoonSleutel(''), '');
  });

  test('csv houdt aanhalingstekens en komma\'s in een cel', () => {
    const rijen = parseCsv('id,raw\nBKG-1,"100,--, rest"\n');
    assert.equal(rijen[0].raw, '100,--, rest');
  });
});

describe('dry-run zonder database', () => {
  test('high-review, suggestie en x worden niet geïmporteerd; tweede run maakt niets nieuws', () => {
    const pakket = leegPakket();
    pakket.relaties.push(
      { relatie_id: 'REL-1', naam: 'Anna Boer', email: 'anna@example.test', telefoon: '0611111111', adres_raw: 'Dorp 1', geboortedatum: '', geboortedatum_raw: '', naam_bronwaarden: '', email_bronwaarden: '', telefoon_bronwaarden: '', bronreferenties: 'lijst.docx#1', review_status: 'OK' },
      { relatie_id: 'REL-2', naam: 'Bob Vos', email: 'bob@example.test', telefoon: '0622222222', adres_raw: '', geboortedatum: '1950-07-23', geboortedatum_raw: '23 juli 195.', naam_bronwaarden: '', email_bronwaarden: '', telefoon_bronwaarden: '', bronreferenties: 'lijst.docx#4', review_status: 'OK' },
    );
    pakket.rollen.push({ rol_id: 'ROL-1', relatie_id: 'REL-1', rol_raw: 'gastbegeleider', rol: 'gastbegeleider', bronbestand: 'lijst.docx' });
    pakket.boekingen.push(
      { boeking_id: 'BKG-1', jaar: '2026', datum_label_raw: 'Mei 1/2', datum_start: '2026-05-01', datum_eind: '2026-05-02', datum_suggestie: '', date_parse_status: 'high', status: 'actief', type: 'huwelijk', huurder_naam_raw: 'Anna', huurder_primair_naam: 'Anna Boer', relatie_id: 'REL-1', telefoon_raw: '0611111111', email_raw: 'anna@example.test', cont_raw: 'ja', totaal_raw: '100', totaal_eur: '100.00', termijn_1_raw: '', termijn_2_raw: '', bijzonderheden_raw: '', contract_datum: '', bronbestand: '2026.xlsx', bronregel: '1', review_status: 'OK' },
      { boeking_id: 'BKG-2', jaar: '2026', datum_label_raw: '2009', datum_start: '', datum_eind: '', datum_suggestie: '2026-07-09', date_parse_status: 'low', status: 'actief', type: '', huurder_naam_raw: 'Bob', huurder_primair_naam: 'Bob Vos', relatie_id: 'REL-2', telefoon_raw: '', email_raw: '', cont_raw: 'nee', totaal_raw: '', totaal_eur: '', termijn_1_raw: '', termijn_2_raw: '', bijzonderheden_raw: '', contract_datum: '', bronbestand: '2026.xlsx', bronregel: '2', review_status: 'REVIEW_NEEDED' },
      { boeking_id: 'BKG-3', jaar: '2026', datum_label_raw: 'Juni 1', datum_start: '2026-06-01', datum_eind: '2026-06-01', datum_suggestie: '', date_parse_status: 'high', status: 'geannuleerd', type: '', huurder_naam_raw: 'Anna', huurder_primair_naam: 'Anna Boer', relatie_id: 'REL-1', telefoon_raw: '', email_raw: '', cont_raw: '', totaal_raw: '', totaal_eur: '', termijn_1_raw: '', termijn_2_raw: '', bijzonderheden_raw: '', contract_datum: '', bronbestand: '2026.xlsx', bronregel: '3', review_status: 'OK' },
    );
    pakket.betalingen.push(
      { betaling_id: 'PAY-1', boeking_id: 'BKG-1', soort: 'termijn_1', bedrag_eur_eerste_waarde: '100.00', status: 'betaald', betaaldatum: '2026-01-01', vervaldatum: '', raw: '100,--', parse_status: 'OK', bronbestand: '2026.xlsx', bronregel: '1', bronkolom: 't1' },
      { betaling_id: 'PAY-2', boeking_id: 'BKG-1', soort: 'historisch_2021', bedrag_eur_eerste_waarde: '50.00', status: 'betaald', betaaldatum: '', vervaldatum: '', raw: '50,--', parse_status: 'OK', bronbestand: '2026.xlsx', bronregel: '1', bronkolom: 'h' },
      { betaling_id: 'PAY-3', boeking_id: 'BKG-1', soort: 'termijn_2', bedrag_eur_eerste_waarde: '25.00', status: 'gemengd', betaaldatum: '', vervaldatum: '', raw: '25 betaald 10 open', parse_status: 'REVIEW_NEEDED', bronbestand: '2026.xlsx', bronregel: '1', bronkolom: 't2' },
    );
    pakket.toewijzingen.push(
      { toewijzing_id: 'ASN-1', boeking_id: 'BKG-1', gastbegeleider_relatie_id: 'REL-1', gastbegeleider_kolom: 'za', bronwaarde: 'dienst', type: 'dienst', import_advies: 'IMPORT', match_methode: 'email', match_confidence: 'high', exposant_raw: '', datum_label_raw: '', bronbestand: 'indeling.xlsx', bronregel: '2' },
      { toewijzing_id: 'ASN-2', boeking_id: 'BKG-1', gastbegeleider_relatie_id: 'REL-1', gastbegeleider_kolom: 'zo', bronwaarde: 'x', type: 'x_onbekende_betekenis', import_advies: 'NIET_IMPORTEREN_ZONDER_BEVESTIGING', match_methode: 'email', match_confidence: 'high', exposant_raw: '', datum_label_raw: '', bronbestand: 'indeling.xlsx', bronregel: '3' },
      { toewijzing_id: 'ASN-3', boeking_id: 'BKG-2', gastbegeleider_relatie_id: 'REL-2', gastbegeleider_kolom: 'za', bronwaarde: 'dienst', type: 'dienst', import_advies: 'IMPORT', match_methode: 'datum', match_confidence: 'low', exposant_raw: '', datum_label_raw: '', bronbestand: 'indeling.xlsx', bronregel: '4' },
    );
    pakket.blokkades.push({ blokkade_id: 'BLK-1', jaar: '2026', datum_label_raw: 'winter', datum_start: '2026-12-19', datum_eind: '2027-01-04', reden: 'winterstop', bronbestand: '2026.xlsx', bronregel: '9', date_parse_status: 'high', review_status: 'OK' });
    pakket.review.push(
      { severity: 'high', entity_type: 'relatie', entity_id: 'RELC-VOL-004', source_file: 'lijst.docx', source_row: '4', field: 'geboortedatum', issue: 'Geboortedatum onvolledig', raw_value: '23 juli 195.', suggested_value: '' },
      { severity: 'high', entity_type: 'boeking', entity_id: 'BKG-2', source_file: '2026.xlsx', source_row: '2', field: 'datum', issue: 'jaar 2009', raw_value: '2009', suggested_value: '2026-07-09' },
      { severity: 'high', entity_type: 'indeling', entity_id: 'ASN-SRC-004', source_file: 'indeling.xlsx', source_row: '4', field: 'boeking_match', issue: 'alleen datumslot', raw_value: '', suggested_value: '' },
      { severity: 'medium', entity_type: 'toewijzing', entity_id: 'ASN-2', source_file: 'indeling.xlsx', source_row: '3', field: 'bronwaarde', issue: 'x', raw_value: 'x', suggested_value: '' },
    );

    const eerste = consolidatieDryRun(pakket);
    assert.equal(eerste.rapport.geschrevenNaarDatabase, false);
    assert.equal(eerste.rapport.relaties.nieuw, 1);
    assert.equal(eerste.rapport.relaties.review_blocked, 1);
    assert.equal(eerste.rapport.boekingen.nieuw, 2);
    assert.equal(eerste.rapport.boekingen.geannuleerd, 1);
    assert.equal(eerste.rapport.boekingen.review_blocked, 1);
    assert.equal(eerste.beeld.some((rij) => rij.externalId === 'BKG-2'), false);
    assert.equal(eerste.beeld.some((rij) => rij.externalId === 'REL-2'), false);
    const boeking = eerste.beeld.find((rij) => rij.externalId === 'BKG-1');
    assert.equal(boeking?.velden.status, 'migratie_vastgelegd');
    assert.equal(boeking?.velden.aanbetaling_ontvangen, undefined);
    assert.equal(eerste.rapport.betalingen.importeerbaar, 2);
    assert.equal(eerste.rapport.betalingen.review, 1);
    assert.equal(eerste.rapport.betalingen.schema_wacht, 0);
    assert.equal(eerste.rapport.gastbegeleider.genegeerdeX, 1);
    assert.equal(eerste.rapport.gastbegeleider.dienst, 1);
    assert.equal(eerste.rapport.gastbegeleider.review_blocked, 1);
    assert.equal(eerste.rapport.blokkades.insert, 1);
    assert.equal(eerste.rapport.highReview.every((regel) => regel.dispositie.startsWith('review_blocked')), true);
    assert.equal(eerste.rapport.integriteit.ok, true);

    const tweede = consolidatieDryRun(pakket, eerste.beeld);
    assert.equal(tweede.rapport.relaties.insert, 0);
    assert.equal(tweede.rapport.boekingen.insert, 0);
    assert.equal(tweede.rapport.betalingen.insert, 0);
    assert.equal(tweede.rapport.blokkades.insert, 0);
    assert.equal(tweede.rapport.gastbegeleider.dienst, 0);
    assert.equal(tweede.rapport.schemaWacht.length, 0);
    assert.equal(eerste.rapport.gastbegeleiderDatums.importeerbaar, 1);
    assert.equal(eerste.rapport.gastbegeleiderDatums.metDatum, 0);
    assert.equal(eerste.rapport.gastbegeleiderDatums.boekingsniveau, 1);
  });

  test('gastbegeleiderdatum alleen bij precies één high-confidence dag', () => {
    const pakket = leegPakket();
    pakket.relaties.push(
      { relatie_id: 'REL-1', naam: 'Betty', email: 'betty@example.test', telefoon: '0611111111', adres_raw: '', geboortedatum: '', geboortedatum_raw: '', naam_bronwaarden: '', email_bronwaarden: '', telefoon_bronwaarden: '', bronreferenties: '', review_status: 'OK' },
    );
    pakket.boekingen.push(
      { boeking_id: 'BKG-EEN', jaar: '2026', datum_label_raw: 'Juli 3. huwelijk', datum_start: '2026-07-03', datum_eind: '2026-07-03', datum_suggestie: '', date_parse_status: 'high', status: 'actief', type: 'huwelijk', huurder_naam_raw: 'Betty', huurder_primair_naam: 'Betty', relatie_id: 'REL-1', telefoon_raw: '', email_raw: 'betty@example.test', cont_raw: '', totaal_raw: '', totaal_eur: '', termijn_1_raw: '', termijn_2_raw: '', bijzonderheden_raw: '', contract_datum: '', bronbestand: '2026.xlsx', bronregel: '2', review_status: 'OK' },
      { boeking_id: 'BKG-TWEE', jaar: '2026', datum_label_raw: 'Juli 4/5', datum_start: '2026-07-04', datum_eind: '2026-07-05', datum_suggestie: '', date_parse_status: 'high', status: 'actief', type: '', huurder_naam_raw: 'Betty', huurder_primair_naam: 'Betty', relatie_id: 'REL-1', telefoon_raw: '', email_raw: '', cont_raw: '', totaal_raw: '', totaal_eur: '', termijn_1_raw: '', termijn_2_raw: '', bijzonderheden_raw: '', contract_datum: '', bronbestand: '2026.xlsx', bronregel: '3', review_status: 'OK' },
    );
    pakket.toewijzingen.push(
      { toewijzing_id: 'ASN-EXACT', boeking_id: 'BKG-EEN', gastbegeleider_relatie_id: 'REL-1', gastbegeleider_kolom: 'BETTY', bronwaarde: 'dienst', type: 'dienst', import_advies: 'IMPORT', match_methode: 'email', match_confidence: 'high', exposant_raw: '', datum_label_raw: 'Juli 3. huwelijk', bronbestand: 'indeling.xlsx', bronregel: '2' },
      { toewijzing_id: 'ASN-AMBIGU', boeking_id: 'BKG-TWEE', gastbegeleider_relatie_id: 'REL-1', gastbegeleider_kolom: 'HANS', bronwaarde: 'dienst', type: 'dienst', import_advies: 'IMPORT', match_methode: 'email', match_confidence: 'high', exposant_raw: '', datum_label_raw: 'Juli 4/5', bronbestand: 'indeling.xlsx', bronregel: '3' },
      { toewijzing_id: 'ASN-X', boeking_id: 'BKG-EEN', gastbegeleider_relatie_id: 'REL-1', gastbegeleider_kolom: 'RON', bronwaarde: 'x', type: 'x_onbekende_betekenis', import_advies: 'NIET_IMPORTEREN_ZONDER_BEVESTIGING', match_methode: 'email', match_confidence: 'high', exposant_raw: '', datum_label_raw: 'Juli 3. huwelijk', bronbestand: 'indeling.xlsx', bronregel: '2' },
    );
    const rapport = consolidatieDryRun(pakket).rapport;
    assert.equal(rapport.gastbegeleider.genegeerdeX, 1);
    assert.equal(rapport.gastbegeleider.dienst, 2);
    assert.equal(rapport.gastbegeleider.review_blocked, 0);
    assert.equal(rapport.gastbegeleiderDatums.bruikbaar, 2);
    assert.equal(rapport.gastbegeleiderDatums.importeerbaar, 2);
    assert.equal(rapport.gastbegeleiderDatums.metDatum, 1);
    assert.equal(rapport.gastbegeleiderDatums.metDatumRijen[0]?.datum, '2026-07-03');
    assert.equal(rapport.gastbegeleiderDatums.boekingsniveau, 1);
    assert.equal(rapport.gastbegeleiderDatums.boekingsniveauRijen[0]?.toewijzingId, 'ASN-AMBIGU');
    assert.equal(rapport.gastbegeleiderDatums.boekingsniveauRijen[0]?.datum, undefined);
  });

  test('matcht op e-mail of telefoon+naam en nooit op alleen naam', () => {
    const pakket = leegPakket();
    pakket.relaties.push(
      { relatie_id: 'REL-A', naam: 'Cees Dijkstra', email: 'cees@example.test', telefoon: '0633333333', adres_raw: '', geboortedatum: '', geboortedatum_raw: '', naam_bronwaarden: '', email_bronwaarden: '', telefoon_bronwaarden: '', bronreferenties: '', review_status: 'OK' },
      { relatie_id: 'REL-B', naam: 'Daan Evers', email: '', telefoon: '0644444444', adres_raw: '', geboortedatum: '', geboortedatum_raw: '', naam_bronwaarden: '', email_bronwaarden: '', telefoon_bronwaarden: '', bronreferenties: '', review_status: 'OK' },
      { relatie_id: 'REL-C', naam: 'Freek Groot', email: 'freek@example.test', telefoon: '', adres_raw: '', geboortedatum: '', geboortedatum_raw: '', naam_bronwaarden: '', email_bronwaarden: '', telefoon_bronwaarden: '', bronreferenties: '', review_status: 'OK' },
    );
    const bestaand: BestaandeRij[] = [
      { tabel: 'relaties', externalId: 'db-email', email: 'cees@example.test', telefoon: '', naam: 'Cees Dijkstra', velden: { naam: 'Cees Dijkstra', email: 'cees@example.test', adres: '', telefoon: '' } },
      { tabel: 'relaties', externalId: 'db-tel', email: '', telefoon: '+31644444444', naam: 'Daan Evers', velden: { naam: 'Daan Evers', email: '', telefoon: '+31644444444', adres: '' } },
      { tabel: 'relaties', externalId: 'db-naam', email: 'iemand-anders@example.test', telefoon: '0699999999', naam: 'Freek Groot', velden: { naam: 'Freek Groot', email: 'iemand-anders@example.test', telefoon: '0699999999', adres: 'Kerkpad 2' } },
    ];
    const uit = consolidatieDryRun(pakket, bestaand);
    assert.equal(uit.rapport.relaties.match, 2);
    assert.equal(uit.rapport.relaties.nieuw, 1);
    assert.equal(uit.rapport.relaties.conflict, 0);
    const freek = uit.beeld.find((rij) => rij.externalId === 'REL-C');
    assert.equal(freek?.velden.email, 'freek@example.test');
    const daan = uit.beeld.find((rij) => rij.externalId === 'db-tel');
    assert.ok(daan);
  });

  test('lege bron wist een rijkere waarde niet, een afwijkende waarde is een conflict', () => {
    const pakket = leegPakket();
    pakket.relaties.push({
      relatie_id: 'REL-D', naam: 'Gijs Hof', email: '', telefoon: '0655555555', adres_raw: '',
      geboortedatum: '', geboortedatum_raw: '', naam_bronwaarden: '', email_bronwaarden: '', telefoon_bronwaarden: '', bronreferenties: '', review_status: 'OK',
    });
    const bestaand: BestaandeRij[] = [{
      tabel: 'relaties', externalId: 'REL-D', legacyId: 'REL-D', email: 'gijs@example.test', telefoon: '0655555555', naam: 'Gijs Hof',
      velden: { naam: 'Gijs Hof', email: 'gijs@example.test', telefoon: '0655555555', adres: 'Laan 3' },
    }];
    const behouden = consolidatieDryRun(pakket, bestaand);
    assert.equal(behouden.rapport.relaties.skip, 1);
    assert.equal(behouden.beeld.find((rij) => rij.externalId === 'REL-D')?.velden.email, 'gijs@example.test');

    pakket.relaties[0].email = 'ander@example.test';
    const conflict = consolidatieDryRun(pakket, bestaand);
    assert.equal(conflict.rapport.relaties.conflict, 1);
    assert.equal(conflict.beeld.find((rij) => rij.externalId === 'REL-D')?.velden.email, 'gijs@example.test');
  });

  test('een high-review op een boeking blokkeert de huurderrelatie niet', () => {
    const pakket = leegPakket();
    pakket.relaties.push({
      relatie_id: 'REL-H', naam: 'Iris Jong', email: 'iris@example.test', telefoon: '0677777777', adres_raw: '',
      geboortedatum: '', geboortedatum_raw: '', naam_bronwaarden: '', email_bronwaarden: '', telefoon_bronwaarden: '',
      bronreferenties: '2026.xlsx#18', review_status: 'OK',
    });
    pakket.boekingen.push({
      boeking_id: 'BKG-H', jaar: '2026', datum_label_raw: 'x', datum_start: '2026-03-01', datum_eind: '2026-03-02', datum_suggestie: '',
      date_parse_status: 'high', status: 'actief', type: '', huurder_naam_raw: 'Iris', huurder_primair_naam: 'Iris Jong', relatie_id: 'REL-H',
      telefoon_raw: '', email_raw: '', cont_raw: 'nee', totaal_raw: '', totaal_eur: '', termijn_1_raw: '', termijn_2_raw: '',
      bijzonderheden_raw: '', contract_datum: '', bronbestand: '2026.xlsx', bronregel: '18', review_status: 'REVIEW_NEEDED',
    });
    pakket.review.push({
      severity: 'high', entity_type: 'boeking', entity_id: 'BKG-H', source_file: '2026.xlsx', source_row: '18',
      field: 'status/huurder', issue: 'label wijkt af', raw_value: '', suggested_value: '',
    });
    const uit = consolidatieDryRun(pakket);
    assert.equal(uit.rapport.relaties.nieuw, 1);
    assert.equal(uit.rapport.boekingen.review_blocked, 1);
  });

  test('verrijkt alleen lege velden en houdt een rijkere waarde', () => {
    const pakket = leegPakket();
    pakket.relaties.push({
      relatie_id: 'REL-V', naam: 'Gijs Hof', email: '', telefoon: '0655555555', adres_raw: 'Nieuw pad 1',
      geboortedatum: '', geboortedatum_raw: '', naam_bronwaarden: '', email_bronwaarden: '', telefoon_bronwaarden: '', bronreferenties: '', review_status: 'OK',
    });
    const bestaand: BestaandeRij[] = [{
      tabel: 'relaties', externalId: 'db-1', legacyId: 'sanity-1', email: 'gijs@example.test', telefoon: '+31655555555', naam: 'Gijs Hof',
      velden: { naam: 'Gijs Hof', email: 'gijs@example.test', telefoon: '+31655555555', adres: '' },
    }];
    const uit = consolidatieDryRun(pakket, bestaand);
    const rij = uit.rapport.vergelijking.relaties;
    assert.equal(rij.zouVerrijken, 1);
    assert.equal(rij.bestaandExact, 1);
    assert.equal(rij.nieuw, 0);
    assert.deepEqual(rij.verrijkingen[0].toegevoegd, ['adres']);
    assert.deepEqual(rij.verrijkingen[0].behouden, ['email']);
    assert.equal(uit.beeld.find((item) => item.externalId === 'db-1')?.velden.email, 'gijs@example.test');
  });

  test('boeking matcht op periode plus huurder, niet op naam', () => {
    const pakket = leegPakket();
    pakket.relaties.push({
      relatie_id: 'REL-1', naam: 'Anna Boer', email: 'anna@example.test', telefoon: '', adres_raw: '',
      geboortedatum: '', geboortedatum_raw: '', naam_bronwaarden: '', email_bronwaarden: '', telefoon_bronwaarden: '', bronreferenties: '', review_status: 'OK',
    });
    pakket.boekingen.push({
      boeking_id: 'BKG-1', jaar: '2026', datum_label_raw: 'Mei', datum_start: '2026-05-01', datum_eind: '2026-05-02', datum_suggestie: '',
      date_parse_status: 'high', status: 'actief', type: '', huurder_naam_raw: 'Anna', huurder_primair_naam: 'Anna Boer', relatie_id: 'REL-1',
      telefoon_raw: '', email_raw: 'anna@example.test', cont_raw: 'ja', totaal_raw: '', totaal_eur: '', termijn_1_raw: '', termijn_2_raw: '',
      bijzonderheden_raw: '', contract_datum: '', bronbestand: '2026.xlsx', bronregel: '1', review_status: 'OK',
    });
    const bestaand: BestaandeRij[] = [{
      tabel: 'boekingen', externalId: 'db-boeking', velden: {
        start_datum: '2026-05-01', eind_datum: '2026-05-02', huurder_relatie_id: 'REL-1', status: 'migratie_vastgelegd', interne_notities: 'bewaar dit',
      },
    }];
    const uit = consolidatieDryRun(pakket, bestaand);
    assert.equal(uit.rapport.vergelijking.boekingen.unchanged, 1);
    assert.equal(uit.rapport.vergelijking.boekingen.nieuw, 0);
    assert.deepEqual(uit.rapport.vergelijking.boekingen.verrijkingen, []);
    assert.ok(uit.rapport.vergelijking.boekingen.bestaandExact === 1);
  });

  test('een betaalregel zonder boeking is een orphan', () => {
    const pakket = leegPakket();
    pakket.betalingen.push({
      betaling_id: 'PAY-X', boeking_id: 'BKG-ONTBREEKT', soort: 'termijn_1', bedrag_eur_eerste_waarde: '10.00', status: 'betaald',
      betaaldatum: '', vervaldatum: '', raw: '10,--', parse_status: 'OK', bronbestand: '2026.xlsx', bronregel: '1', bronkolom: 't1',
    });
    const uit = consolidatieDryRun(pakket);
    assert.equal(uit.rapport.vergelijking.betalingen.orphan, 1);
    assert.equal(uit.rapport.vergelijking.betalingen.conflicten.length, 0);
  });

  test('e-mail en telefoon+naam naar twee verschillende relaties is een conflict', () => {
    const pakket = leegPakket();
    pakket.relaties.push({
      relatie_id: 'REL-E', naam: 'Henk Ieps', email: 'henk@example.test', telefoon: '0666666666', adres_raw: '',
      geboortedatum: '', geboortedatum_raw: '', naam_bronwaarden: '', email_bronwaarden: '', telefoon_bronwaarden: '', bronreferenties: '', review_status: 'OK',
    });
    const bestaand: BestaandeRij[] = [
      { tabel: 'relaties', externalId: 'een', email: 'henk@example.test', naam: 'Henk Ieps', telefoon: '', velden: { naam: 'Henk Ieps', email: 'henk@example.test', telefoon: '', adres: '' } },
      { tabel: 'relaties', externalId: 'twee', email: '', naam: 'Henk Ieps', telefoon: '31666666666', velden: { naam: 'Henk Ieps', email: '', telefoon: '31666666666', adres: '' } },
    ];
    const uit = consolidatieDryRun(pakket, bestaand);
    assert.equal(uit.rapport.relaties.conflict, 1);
    assert.equal(uit.rapport.relaties.nieuw, 0);
  });
});
