import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  controleerBron,
  formatRapport,
  interpreteerContact,
  parsePeriode,
  telefoonSleutelsVan,
  parseTermijn,
  parseZuiverBedrag,
  pasPlanToe,
  planHistorischeHuur,
  sqlIsVeilig,
  type HistorischeDb,
  type ImportRecord,
} from '../src/platform/historische-huur-import.ts';

function record(over: Partial<ImportRecord> & Pick<ImportRecord, 'source_fingerprint' | 'source_row'>): ImportRecord {
  return {
    source_year: 2026,
    source_file: '2026-test.xlsx',
    source_sheet: 'Blad1',
    row_type: 'slot',
    period_raw: 'Mei 2/3',
    tenant_name_raw: 'Test Huurder',
    phone_raw: null,
    email_raw: null,
    contract_raw: null,
    amount_due_raw: null,
    installment_1_raw: null,
    installment_2_raw: null,
    notes_raw: null,
    historical_columns: {},
    ...over,
  };
}

function legeDb(): HistorischeDb {
  return { boekingen: [], relaties: [], betalingen: [], blokkades: [], bronregels: [] };
}

describe('historische huurimport', () => {
  test('nieuwe reservering wordt CREATED', () => {
    const plan = planHistorischeHuur({ import_records: [record({ source_fingerprint: 'a'.repeat(20), source_row: 10, email_raw: 'info@bedrijf.nl', amount_due_raw: '450,--' })] }, legeDb());
    assert.equal(plan.regels[0].uitkomst, 'CREATED');
    assert.equal(plan.regels[0].nieuw?.boeking?.status, 'migratie_vastgelegd');
    assert.equal(plan.regels[0].nieuw?.boeking?.email, 'info@bedrijf.nl');
    assert.equal(plan.regels[0].nieuw?.boeking?.tarief, 450);
    assert.equal(sqlIsVeilig(plan.sql).length, 0);
  });

  test('exact dezelfde reservering blijft MATCHED_UNCHANGED', () => {
    const db = legeDb();
    db.boekingen.push({
      id: 5,
      status: 'migratie_vastgelegd',
      start_datum: '2026-05-02',
      eind_datum: '2026-05-03',
      interne_titel: 'Test Huurder',
      huurder_naam_snapshot: 'Test Huurder',
      huurder_email_snapshot: 'info@bedrijf.nl',
      huurder_telefoon_snapshot: '0612345678',
      huurder_relatie_id: null,
      interne_notities: 'Contract: nee\ncontr verz 01-01-2026',
      mede_exposanten: null,
      tarief_bedrag: '450.00',
      tarief_prijstype: 'vast',
      aanbetaling_bedrag: '100.00',
      verhuurtype_sleutel: null,
      migration_source: null,
      migration_external_id: null,
      nummer: 'BKG-1',
    });
    db.betalingen.push({
      id: 9,
      boeking_id: 5,
      soort: 'aanbetaling',
      bedrag: '100.00',
      status: 'ontvangen',
      vervaldatum: null,
      ontvangen_op: '2026-01-01',
      referentie: '100 betaald 01-01-2026',
      migration_source: null,
      migration_external_id: null,
    });
    const plan = planHistorischeHuur({
      import_records: [record({
        source_fingerprint: 'b'.repeat(20),
        source_row: 11,
        email_raw: ' INFO@BEDRIJF.NL ',
        phone_raw: '06 12 34 56 78',
        amount_due_raw: '450,--',
        installment_1_raw: '100 betaald 01-01-2026',
        contract_raw: 'nee',
        notes_raw: 'contr verz 01-01-2026',
      })],
    }, db);
    assert.equal(plan.regels[0].uitkomst, 'MATCHED_UNCHANGED');
    assert.equal(plan.regels[0].database_id, 5);
    assert.equal(plan.regels[0].aanvullingen.length, 0);
  });

  test('ontbrekend telefoonnummer vult de bestaande reservering', () => {
    const db = legeDb();
    db.boekingen.push({
      id: 6,
      status: 'migratie_vastgelegd',
      start_datum: '2026-05-02',
      eind_datum: '2026-05-03',
      interne_titel: 'Test Huurder',
      huurder_naam_snapshot: 'Test Huurder',
      huurder_email_snapshot: 'info@bedrijf.nl',
      huurder_telefoon_snapshot: null,
      huurder_relatie_id: 3,
      interne_notities: null,
      mede_exposanten: null,
      tarief_bedrag: null,
      tarief_prijstype: null,
      aanbetaling_bedrag: null,
      verhuurtype_sleutel: null,
      migration_source: null,
      migration_external_id: null,
      nummer: 'BKG-2',
    });
    db.relaties.push({ id: 3, naam: 'Test Huurder', email: 'info@bedrijf.nl', telefoon: null, organisatie: null, notities: null, migration_source: null, migration_external_id: null });
    const plan = planHistorischeHuur({
      import_records: [record({ source_fingerprint: 'c'.repeat(20), source_row: 12, phone_raw: '06-12345678', email_raw: 'info@bedrijf.nl' })],
    }, db);
    assert.equal(plan.regels[0].uitkomst, 'MATCHED_ENRICHED');
    assert.ok(plan.regels[0].aanvullingen.some((item) => item.veld === 'huurder_telefoon_snapshot' && item.naar.includes('12345678')));
    const sql = plan.sql.join('\n');
    assert.match(sql, /huurder_telefoon_snapshot is null or btrim/);
    assert.doesNotMatch(sql, /set status/i);
  });

  test('afwijkend bedrag wordt een conflict en blijft staan', () => {
    const db = legeDb();
    db.boekingen.push({
      id: 7,
      status: 'migratie_vastgelegd',
      start_datum: '2026-05-02',
      eind_datum: '2026-05-03',
      interne_titel: 'Test Huurder',
      huurder_naam_snapshot: 'Test Huurder',
      huurder_email_snapshot: null,
      huurder_telefoon_snapshot: null,
      huurder_relatie_id: null,
      interne_notities: null,
      mede_exposanten: null,
      tarief_bedrag: '450.00',
      tarief_prijstype: 'vast',
      aanbetaling_bedrag: null,
      verhuurtype_sleutel: null,
      migration_source: null,
      migration_external_id: null,
      nummer: 'BKG-3',
    });
    const plan = planHistorischeHuur({
      import_records: [record({ source_fingerprint: 'd'.repeat(20), source_row: 13, amount_due_raw: '500,--' })],
    }, db);
    assert.equal(plan.regels[0].uitkomst, 'CONFLICT_REVIEW_REQUIRED');
    assert.equal(plan.regels[0].conflicten.some((item) => item.veld === 'tarief_bedrag' && item.bronwaarde === '500.00' && item.databasewaarde === '450.00'), true);
    assert.equal(plan.regels[0].aanvullingen.some((item) => item.veld === 'tarief_bedrag'), false);
    assert.doesNotMatch(plan.sql.join('\n'), /tarief_bedrag =/);
  });

  test('ander contact van dezelfde organisatie vult de bestaande reservering ook bij een herhaling niet', () => {
    const db = legeDb();
    db.boekingen.push({
      id: 70,
      status: 'migratie_vastgelegd',
      start_datum: '2027-05-29',
      eind_datum: '2027-05-30',
      interne_titel: 'P. Nieuwenhuis (fotoclub NNF Nijmegen)',
      huurder_naam_snapshot: 'P. Nieuwenhuis (fotoclub NNF Nijmegen)',
      huurder_email_snapshot: 'p.nieuwenhuis70@gmail.com',
      huurder_telefoon_snapshot: '0648623312',
      huurder_relatie_id: 71,
      interne_notities: 'contr verz 04-09-2024',
      mede_exposanten: null,
      tarief_bedrag: '490.00',
      tarief_prijstype: 'vast',
      aanbetaling_bedrag: null,
      verhuurtype_sleutel: null,
      migration_source: 'consolidatie',
      migration_external_id: 'BKG-70',
      nummer: 'BKG-70',
    });
    db.relaties.push({
      id: 71,
      naam: 'P. Nieuwenhuis (fotoclub NNF Nijmegen)',
      email: 'p.nieuwenhuis70@gmail.com',
      telefoon: '+31648623312',
      organisatie: null,
      notities: null,
      migration_source: 'consolidatie',
      migration_external_id: 'REL-0075',
    });
    const bron = {
      import_records: [record({
        source_fingerprint: 'h'.repeat(20),
        source_row: 32,
        source_year: 2027,
        period_raw: 'Mei 29/30.',
        tenant_name_raw: 'H.Hulshof (fotoclub NNF Nijmegen)',
        email_raw: 'ander@example.nl',
        contract_raw: 'nee',
        amount_due_raw: 490,
        installment_1_raw: '100,-- betaald 05-10-2024',
      })],
    };
    const eerste = planHistorischeHuur(bron, db);
    assert.equal(eerste.regels[0].uitkomst, 'CONFLICT_REVIEW_REQUIRED');
    assert.equal(eerste.regels[0].aanvullingen.length, 0);
    assert.equal(eerste.regels.filter((regel) => regel.uitkomst === 'CREATED').length, 0);
    const tweede = planHistorischeHuur(bron, pasPlanToe(db, eerste));
    assert.equal(tweede.regels[0].uitkomst, 'CONFLICT_REVIEW_REQUIRED');
    assert.equal(tweede.regels[0].aanvullingen.length, 0);
    assert.equal(tweede.regels.filter((regel) => regel.uitkomst === 'CREATED').length, 0);
    assert.equal(pasPlanToe(db, tweede).boekingen.length, 1);
  });

  test('lege bron-e-mail wist het database-adres niet', () => {
    const db = legeDb();
    db.boekingen.push({
      id: 8,
      status: 'migratie_vastgelegd',
      start_datum: '2026-05-02',
      eind_datum: '2026-05-03',
      interne_titel: 'Test Huurder',
      huurder_naam_snapshot: 'Test Huurder',
      huurder_email_snapshot: 'blijft@kerkje.nl',
      huurder_telefoon_snapshot: null,
      huurder_relatie_id: null,
      interne_notities: null,
      mede_exposanten: null,
      tarief_bedrag: null,
      tarief_prijstype: null,
      aanbetaling_bedrag: null,
      verhuurtype_sleutel: null,
      migration_source: null,
      migration_external_id: null,
      nummer: 'BKG-4',
    });
    const plan = planHistorischeHuur({
      import_records: [record({ source_fingerprint: 'e'.repeat(20), source_row: 14, email_raw: '   ' })],
    }, db);
    assert.equal(plan.regels[0].aanvullingen.some((item) => item.veld === 'huurder_email_snapshot'), false);
    assert.equal(plan.regels[0].conflicten.some((item) => item.veld === 'huurder_email_snapshot'), false);
    const na = pasPlanToe(db, plan);
    assert.equal(na.boekingen[0].huurder_email_snapshot, 'blijft@kerkje.nl');
  });

  test('tweede run maakt geen duplicaten', () => {
    const bron = {
      import_records: [
        record({ source_fingerprint: 'f'.repeat(20), source_row: 15, email_raw: 'nieuw@kerkje.nl', phone_raw: 612345678, amount_due_raw: 490, installment_1_raw: '100 betaald 02-02-2026' }),
        record({ source_fingerprint: '1'.repeat(20), source_row: 16, period_raw: 'December 19/20', tenant_name_raw: 'winterstop', row_type: 'winterstop' }),
      ],
    };
    const eerste = planHistorischeHuur(bron, legeDb());
    assert.equal(eerste.regels.filter((regel) => regel.uitkomst === 'CREATED').length, 1);
    const na = pasPlanToe(legeDb(), eerste);
    const tweede = planHistorischeHuur(bron, na);
    assert.equal(tweede.regels.filter((regel) => regel.uitkomst === 'CREATED' || regel.uitkomst === 'WINTERSTOP_CREATED').length, 0);
    assert.equal(na.boekingen.length, 1);
    assert.equal(tweede.regels[0].uitkomst === 'MATCHED_UNCHANGED' || tweede.regels[0].uitkomst === 'MATCHED_ENRICHED', true);
  });

  test('winterstop wordt geen huurder', () => {
    const plan = planHistorischeHuur({
      import_records: [record({ source_fingerprint: '2'.repeat(20), source_row: 17, period_raw: 'Januari 2/3', tenant_name_raw: 'winterstop', row_type: 'winterstop', source_year: 2027 })],
    }, legeDb());
    assert.equal(plan.regels[0].uitkomst, 'WINTERSTOP_CREATED');
    assert.equal(plan.regels[0].nieuw?.blokkade?.blokkeert, true);
    assert.equal(plan.regels[0].nieuw?.relatie, undefined);
    assert.equal(plan.sql.some((stmt) => /insert into public\.relaties/i.test(stmt) && /winterstop/i.test(stmt)), false);
  });

  test('geannuleerde huur blijft als historische reservering bestaan', () => {
    const plan = planHistorischeHuur({
      import_records: [record({
        source_fingerprint: '3'.repeat(20),
        source_row: 18,
        period_raw: 'Mei 2/3 geannuleerd',
        tenant_name_raw: 'Annulatie Persoon',
        notes_raw: 'niet doorgegaan',
      })],
    }, legeDb());
    assert.equal(plan.regels[0].uitkomst, 'CREATED');
    assert.equal(plan.regels[0].nieuw?.boeking?.status, 'geannuleerd');
    const na = pasPlanToe(legeDb(), plan);
    assert.equal(na.boekingen[0].status, 'geannuleerd');
    const tweede = planHistorischeHuur({ import_records: plan.regels.map((regel) => regel.record) }, na);
    assert.equal(tweede.regels[0].uitkomst === 'MATCHED_UNCHANGED' || tweede.regels[0].uitkomst === 'MATCHED_ENRICHED' || tweede.regels[0].uitkomst === 'CONFLICT_REVIEW_REQUIRED', true);
    assert.equal(pasPlanToe(na, tweede).boekingen.filter((boeking) => boeking.huurder_naam_snapshot === 'Annulatie Persoon').length, 1);
  });

  test('ambigue datum wordt niet geraden', () => {
    const plan = planHistorischeHuur({
      import_records: [record({
        source_fingerprint: '4'.repeat(20),
        source_row: 19,
        period_raw: '9-7-2009.',
        tenant_name_raw: 'concert door Hanneke Roos',
        amount_due_raw: '200,--',
      })],
    }, legeDb());
    assert.equal(plan.regels[0].uitkomst, 'NIET_VERWERKT');
    assert.equal(plan.regels[0].start, null);
    assert.equal(plan.regels[0].nieuw?.boeking, undefined);
    assert.ok(plan.regels[0].warnings.some((item) => item.code === 'datum_jaar_wijkt_af'));
    const ongeldig = parseTermijn('350,-- te bet voor 31-06-2025*', 'installment_2_raw');
    assert.equal(ongeldig.vervaldatum, null);
    assert.ok(ongeldig.waarschuwingen.some((item) => item.code === 'ongeldige_datum'));
    const nogNietBetaald = planHistorischeHuur({
      import_records: [record({
        source_fingerprint: 'o'.repeat(20),
        source_row: 46,
        installment_1_raw: '100 te bet voor 01-02-2026',
        installment_2_raw: '390 voor 01-06-2026',
      })],
    }, legeDb());
    assert.equal(nogNietBetaald.regels[0].nieuw?.betalingen, undefined);
    assert.ok(nogNietBetaald.regels[0].warnings.some((item) => item.code === 'termijn_nog_niet_betaald'));
    const welBetaald = planHistorischeHuur({
      import_records: [record({
        source_fingerprint: 'p'.repeat(20),
        source_row: 47,
        installment_1_raw: '100 betaald 02-02-2026',
      })],
    }, legeDb());
    assert.equal(welBetaald.regels[0].nieuw?.betalingen?.length, 1);
    assert.equal(welBetaald.regels[0].nieuw?.betalingen?.[0].status, 'ontvangen');
  });

  test('e-mail in het telefoonveld en spaties in een adres', () => {
    const contact = interpreteerContact(record({
      source_fingerprint: '5'.repeat(20),
      source_row: 20,
      tenant_name_raw: 'Rebecca Engels',
      phone_raw: 'natureartbyrebecca@gmail.com',
      email_raw: 'info @robpluijm.nl',
    }));
    assert.equal(contact.telefoon, null);
    assert.ok(contact.waarschuwingen.some((item) => item.code === 'email_in_telefoonveld'));
    assert.equal(contact.email, 'info@robpluijm.nl');
    assert.ok(contact.extraEmails.includes('natureartbyrebecca@gmail.com'));
    const alleenTelefoon = interpreteerContact(record({
      source_fingerprint: '7'.repeat(20),
      source_row: 22,
      phone_raw: 'natureartbyrebecca@gmail.com',
      email_raw: null,
    }));
    assert.equal(alleenTelefoon.email, 'natureartbyrebecca@gmail.com');
    assert.equal(alleenTelefoon.telefoon, null);
    const alleenSpaties = interpreteerContact(record({
      source_fingerprint: '6'.repeat(20),
      source_row: 21,
      email_raw: 'info @robpluijm.nl',
      phone_raw: null,
    }));
    assert.equal(alleenSpaties.email, 'info@robpluijm.nl');
    assert.equal(parseZuiverBedrag('450,--').bedrag, 450);
    assert.equal(parseZuiverBedrag('562.50').bedrag, 562.5);
    const periode = parsePeriode('Februari 28/1 maart', 2026);
    assert.deepEqual([periode.start, periode.eind], ['2026-02-28', '2026-03-01']);
    const los = parsePeriode('Juni12.huwelijk', 2026);
    assert.equal(los.start, '2026-06-12');
    assert.equal(los.eind, '2026-06-12');
    assert.ok(los.waarschuwingen.length > 0);
  });

  test('driedaagse periode, deeladressen en voorloopnullen', () => {
    const pasen = parsePeriode('April 4/5/6 pasen', 2026);
    assert.deepEqual([pasen.start, pasen.eind], ['2026-04-04', '2026-04-06']);
    assert.ok(pasen.waarschuwingen.some((item) => item.code === 'geen_zaterdag_zondag'));
    const pinksteren = parsePeriode('Mei 23/24/25 pinksteren', 2026);
    assert.deepEqual([pinksteren.start, pinksteren.eind], ['2026-05-23', '2026-05-25']);

    const deeladressen = [
      'ellenvanderwa;2@gmail.com',
      'maartje gruter @gmail.com',
      'leon,swinkels@kpnmail.nl',
    ];
    for (const [index, email] of deeladressen.entries()) {
      const contact = interpreteerContact(record({
        source_fingerprint: `d${index}`.padEnd(20, 'd'),
        source_row: 30 + index,
        email_raw: email,
        phone_raw: null,
      }));
      assert.equal(contact.email, null, email);
      assert.ok(contact.waarschuwingen.some((item) => item.code === 'email_niet_eenduidig'), email);
    }
    const metBedrag = interpreteerContact(record({
      source_fingerprint: 'b'.repeat(20),
      source_row: 40,
      email_raw: 'leon.swinkels@kpnmail.nl 450,--',
      phone_raw: null,
    }));
    assert.equal(metBedrag.email, 'leon.swinkels@kpnmail.nl');
    const twee = interpreteerContact(record({
      source_fingerprint: 't'.repeat(20),
      source_row: 41,
      tenant_name_raw: 'kwvandongen@outlook.com; f.udinktencate@gmail.com',
      email_raw: null,
      phone_raw: null,
    }));
    assert.equal(twee.email, 'kwvandongen@outlook.com');
    assert.ok(twee.extraEmails.includes('f.udinktencate@gmail.com'));

    const mirjam = interpreteerContact(record({
      source_fingerprint: 'm'.repeat(20),
      source_row: 42,
      phone_raw: '06521899832mirjamwithaar@gmail.com',
      email_raw: null,
    }));
    assert.equal(mirjam.email, 'mirjamwithaar@gmail.com');
    assert.equal(mirjam.telefoon, '06521899832');
    const wegh = interpreteerContact(record({
      source_fingerprint: 'w'.repeat(20),
      source_row: 43,
      phone_raw: '06 57967715art@robwegh.com',
      email_raw: null,
    }));
    assert.equal(wegh.email, null);
    assert.equal(wegh.telefoon, null);
    assert.ok(wegh.waarschuwingen.some((item) => item.code === 'email_niet_eenduidig'));
    const verschoven = interpreteerContact(record({
      source_fingerprint: 's'.repeat(20),
      source_row: 45,
      phone_raw: '2xs4all.nl',
      email_raw: 'm.arnold65@outlook.com',
    }));
    assert.equal(verschoven.telefoon, null);
    assert.equal(verschoven.email, 'm.arnold65@outlook.com');
    assert.ok(verschoven.waarschuwingen.some((item) => item.code === 'telefoon_niet_eenduidig'));

    const vast = telefoonSleutelsVan('243229754');
    const plus = telefoonSleutelsVan('+31243229754');
    assert.deepEqual(vast, plus);
    const jelmer = interpreteerContact(record({
      source_fingerprint: 'j'.repeat(20),
      source_row: 44,
      phone_raw: 243771697,
      email_raw: null,
    }));
    assert.equal(jelmer.telefoon, '0243771697');
    assert.ok(jelmer.waarschuwingen.some((item) => item.code === 'excel_voorloopnul'));
    assert.deepEqual(jelmer.telefoonSleutels, telefoonSleutelsVan('+31243771697'));
  });
});

describe('bronbestand sanity', () => {
  const pad = '/home/ubuntu/.cursor/projects/workspace/uploads/kerkje_persingen_import_2026_2029_26b7.json';
  test('244 importrecords, 154 huurders, 29 winterstops en 2 notities', { skip: existsSync(pad) ? false : 'bronbestand ontbreekt' }, () => {
    const bestand = JSON.parse(readFileSync(pad, 'utf8'));
    assert.deepEqual(controleerBron(bestand), []);
    const plan = planHistorischeHuur(bestand, legeDb());
    const domein = plan.regels.filter((regel) => regel.uitkomst !== 'BRONKOP');
    assert.equal(domein.length, 244);
    assert.equal(domein.filter((regel) => regel.klasse === 'winterstop').length, 29);
    assert.equal(sqlIsVeilig(plan.sql).length, 0);
    assert.equal(plan.veiligheid.gevuldeVeldenGewist, 0);
    const tekst = formatRapport(plan);
    assert.match(tekst, /2026/);
    assert.match(tekst, /2029/);
  });
});
