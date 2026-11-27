import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  beoordeelHuurprijs,
  beoordeelVerhuuraanvraag,
  beoordelingsVingerafdruk,
  geldigeBeoordelingsDatum,
  voegKalendermaandenToe,
  type BeoordelingsAanvraag,
  type ExpositieHistorie,
  type VerhuurBeoordelingInvoer,
} from '../src/platform/verhuur-beoordeling.ts';

const aanvraag: BeoordelingsAanvraag = {
  id: 17, status: 'nieuw', naam: 'Karin Janssen', email: 'karin@example.test',
  relatieId: 91, start: '2027-07-10', eind: '2027-07-12', verhuurtype: 'expositie',
};
const vastTarief = { prijstype: 'vast' as const, bedrag: 420.50 };
const input = (extra: Partial<VerhuurBeoordelingInvoer> = {}): VerhuurBeoordelingInvoer => ({
  aanvraag, vandaag: '2026-11-25', tarief: vastTarief, historieCompleet: true, ...extra,
});
const historie = (extra: Partial<ExpositieHistorie> = {}): ExpositieHistorie => ({
  id: 'h-1', expositieId: 'b-1', bron: 'boekingen', referentie: 'KVP-2026-1',
  start: '2026-01-08', eind: '2026-01-11', status: 'afgerond', verhuurtype: 'expositie',
  deelnemers: [{ naam: 'Karin Janssen', relatieId: 91 }], ...extra,
});

describe('interne beschikbaarheid voor het bestuursbesluit', () => {
  test('een aanvraag zonder overlap heeft een concrete prijs en is klaar voor verwerking na akkoord', () => {
    const uit = beoordeelVerhuuraanvraag(input());
    assert.equal(uit.beschikbaarheid, 'beschikbaar');
    assert.deepEqual(uit.conflicts, []);
    assert.equal(uit.hardeBlokkade, false);
    assert.equal(uit.kanAutomatischVerder, true);
    assert.equal(uit.prijs.bedragCent, 42050);
  });

  test('dezelfde dag is overlap; een andere lopende aanvraag is een waarschuwing zonder voorkeursrang', () => {
    const uit = beoordeelVerhuuraanvraag(input({ aanvragen: [
      { ...aanvraag, id: '17' },
      { ...aanvraag, id: 18, naam: 'Andere exposant', start: '2027-07-08', eind: '2027-07-10', binnengekomenOp: '2026-11-20T14:00:00Z' },
      { ...aanvraag, id: 19, start: '2027-07-08', eind: '2027-07-09' },
      { ...aanvraag, id: 20, status: 'afgewezen' },
      { ...aanvraag, id: 21, status: 'gesloten' },
    ] }));
    assert.equal(uit.beschikbaarheid, 'aanvraag');
    assert.equal(uit.hardeBlokkade, false);
    assert.equal(uit.kanAutomatischVerder, false);
    assert.deepEqual(uit.conflicts.map(({ id, type, start, eind, hard }) => ({ id, type, start, eind, hard })), [
      { id: '18', type: 'aanvraag', start: '2027-07-08', eind: '2027-07-10', hard: false },
    ]);
    assert.equal(uit.conflicts[0]?.binnengekomenOp, '2026-11-20T14:00:00Z');
    assert.match(uit.conflicts[0]?.melding ?? '', /er loopt al een aanvraag/);
  });

  test('bestaande opties, verlopen opties en definitieve boekingen blijven harde capaciteitsconflicten', () => {
    for (const status of ['optie', 'optie_verlopen', 'definitief', 'migratie_vastgelegd']) {
      const uit = beoordeelVerhuuraanvraag(input({ boekingen: [{ id: 'b-8', status, start: aanvraag.start, eind: aanvraag.eind }] }));
      assert.equal(uit.beschikbaarheid, 'bezet', status);
      assert.equal(uit.hardeBlokkade, true, status);
      assert.equal(uit.kanAutomatischVerder, false, status);
      assert.equal(uit.conflicts[0]?.type, status.startsWith('optie') ? 'optie' : 'boeking');
    }
  });

  test('eigen boeking en gestopte dossiers leveren geen valse overlap; gekoppelde boeking wordt éénmaal getoond', () => {
    const uit = beoordeelVerhuuraanvraag(input({
      aanvraag: { ...aanvraag, boekingId: 'b-eigen' },
      aanvragen: [{ ...aanvraag, id: 18, boekingId: 'b-ander' }, { ...aanvraag, id: 19, boekingId: 'b-annulering' }],
      boekingen: [
        { id: 'b-eigen', status: 'optie', start: aanvraag.start, eind: aanvraag.eind },
        { id: 'b-ander', aanvraagId: 18, status: 'optie', start: aanvraag.start, eind: aanvraag.eind },
        { id: 'b-annulering', aanvraagId: 19, status: 'geannuleerd', start: aanvraag.start, eind: aanvraag.eind },
        { id: 'b-afgerond', status: 'afgerond', start: aanvraag.start, eind: aanvraag.eind },
      ],
      activiteiten: [
        { id: 'ag-eigen', boekingId: 'b-eigen', titel: 'Eigen', start: aanvraag.start, eind: aanvraag.eind, zichtbaarheid: 'publiek' },
        { id: 'ag-ander', boekingId: 'b-ander', titel: 'Ander', start: aanvraag.start, eind: aanvraag.eind, zichtbaarheid: 'publiek' },
      ],
    }));
    assert.deepEqual(uit.conflicts.map((c) => `${c.type}:${c.id}`), ['optie:b-ander']);
  });

  test('interne blokkades en ongekoppelde publieke activiteiten blokkeren, niet-blokkerende concepten niet', () => {
    const uit = beoordeelVerhuuraanvraag(input({ activiteiten: [
      { id: 'intern', titel: 'Onderhoud', start: aanvraag.start, eind: aanvraag.eind, blokkeert: true },
      { id: 'agenda', titel: 'Concert', start: aanvraag.start, eind: aanvraag.eind, zichtbaarheid: 'publiek' },
      { id: 'concept', titel: 'Concept', start: aanvraag.start, eind: aanvraag.eind, zichtbaarheid: 'concept' },
      { id: 'vrij', titel: 'Vergadering', start: aanvraag.start, eind: aanvraag.eind, zichtbaarheid: 'publiek', blokkeert: false },
      { id: 'cancel', titel: 'Vervallen', start: aanvraag.start, eind: aanvraag.eind, zichtbaarheid: 'publiek', levenscyclus: 'geannuleerd' },
    ] }));
    assert.deepEqual(new Set(uit.conflicts.map((c) => c.type)), new Set(['blokkade', 'activiteit']));
    assert.equal(uit.conflicts.length, 2);
    assert.equal(uit.hardeBlokkade, true);
  });

  test('een bezetmelding wordt pas vrij na de bewuste annulering uit de bestaande bronregel', () => {
    const activiteit = { id: 'bezet', titel: 'Bezet', start: aanvraag.start, eind: aanvraag.eind, zichtbaarheid: 'bezet', levenscyclus: 'geannuleerd' };
    assert.equal(beoordeelVerhuuraanvraag(input({ activiteiten: [activiteit] })).hardeBlokkade, true);
    assert.equal(beoordeelVerhuuraanvraag(input({ activiteiten: [{ ...activiteit, annuleringBevestigd: true }] })).hardeBlokkade, false);
  });

  test('expliciete extra dagen van een activiteit blijven bezet; opbouw in vrije tekst claimt geen dag', () => {
    const boeking = { id: 'b-extra', status: 'optie', start: '2027-07-08', eind: '2027-07-09' };
    const activiteit = { id: 'ag-extra', boekingId: 'b-extra', titel: 'Afgebouwd op zaterdag', start: '2027-07-08', eind: '2027-07-10', zichtbaarheid: 'publiek' };
    const zonderExtra = beoordeelVerhuuraanvraag(input({ aanvraag: { ...aanvraag, toelichting: 'Opbouw vrijdag 9 juli' }, boekingen: [boeking] }));
    assert.equal(zonderExtra.beschikbaarheid, 'beschikbaar');
    const metExtra = beoordeelVerhuuraanvraag(input({ boekingen: [boeking], activiteiten: [activiteit] }));
    assert.equal(metExtra.conflicts[0]?.id, 'ag-extra');
    assert.equal(metExtra.hardeBlokkade, true);
  });

  test('ongeldige of ontbrekende actieve periodes worden zichtbaar en geven geen vrijgave', () => {
    for (const extra of [
      { aanvraag: { ...aanvraag, start: '2027-02-30' } },
      { aanvraag: { ...aanvraag, eind: '2027-07-09' } },
      { boekingen: [{ id: 'b-fout', status: 'optie', start: '', eind: '' }] },
      { aanvragen: [{ ...aanvraag, id: 18, eind: '' }] },
    ]) {
      const uit = beoordeelVerhuuraanvraag(input(extra));
      assert.equal(uit.beschikbaarheid, 'onvolledig');
      assert.equal(uit.hardeBlokkade, true);
      assert.equal(uit.kanAutomatischVerder, false);
      assert.ok(uit.meldingen.some((m) => m.ernst === 'blokkade'));
    }
  });
});

describe('expositiebeleid met kalendermaanden en herleidbare identiteit', () => {
  test('18 kalendermaanden loopt standaard vanaf de einddatum; exact de grens is toegestaan', () => {
    const teVroeg = beoordeelVerhuuraanvraag(input({ historie: [historie()] }));
    assert.equal(teVroeg.historieWaarschuwingen.length, 1);
    assert.equal(teVroeg.historieWaarschuwingen[0]?.regulierVanaf, '2027-07-11');
    assert.equal(teVroeg.historieWaarschuwingen[0]?.zekerheid, 'bevestigd');
    assert.equal(teVroeg.historieWaarschuwingen[0]?.bronId, 'h-1');
    assert.equal(teVroeg.historieWaarschuwingen[0]?.referentie, 'KVP-2026-1');
    assert.equal(teVroeg.hardeBlokkade, false);
    assert.equal(teVroeg.kanAutomatischVerder, true, 'Beleidsafwijking kan door het bestuur worden bevestigd.');
    const precies = beoordeelVerhuuraanvraag(input({ historie: [historie({ eind: '2026-01-10' })] }));
    assert.deepEqual(precies.historieWaarschuwingen, []);
  });

  test('maandeinden en schrikkeljaren gebruiken kalendermaanden en geen aantal dagen', () => {
    assert.equal(voegKalendermaandenToe('2026-08-31', 18), '2028-02-29');
    assert.equal(voegKalendermaandenToe('2024-08-31', 18), '2026-02-28');
    assert.equal(voegKalendermaandenToe('2024-02-29', 18), '2025-08-29');
    assert.equal(geldigeBeoordelingsDatum('2026-02-29'), false);
    assert.equal(geldigeBeoordelingsDatum('2028-02-29'), true);
    assert.throws(() => voegKalendermaandenToe('2026-02-30', 18));
  });

  test('de beleidsgrondslag is expliciet instelbaar en zit in de versie en vingerafdruk', () => {
    const standaard = beoordeelVerhuuraanvraag(input({ historie: [historie()] }));
    const beginTotBegin = beoordeelVerhuuraanvraag(input({ historie: [historie()], beleid: { grondslag: 'begin_begin', versie: 'bestuur-2026-11' } }));
    assert.equal(beginTotBegin.historieWaarschuwingen.length, 0);
    assert.equal(beginTotBegin.beleidsversie, 'bestuur-2026-11');
    assert.notEqual(standaard.vingerafdruk, beginTotBegin.vingerafdruk);
    const ongeldig = beoordeelVerhuuraanvraag(input({ beleid: { maanden: -1 } }));
    assert.ok(ongeldig.meldingen.some((m) => m.code === 'beleid_onvolledig' && m.ernst === 'blokkade'));
  });

  test('ook later geplande exposities worden getoetst; een voorlopige optie blijft als voorlopig herkenbaar', () => {
    const toekomst = historie({ start: '2029-01-11', eind: '2029-01-14', status: 'optie' });
    const uit = beoordeelVerhuuraanvraag(input({ historie: [toekomst] }));
    assert.equal(uit.historieWaarschuwingen[0]?.richting, 'later');
    assert.equal(uit.historieWaarschuwingen[0]?.voorlopig, true);
    assert.equal(uit.historieWaarschuwingen[0]?.regulierVanaf, null);
    assert.equal(uit.historieWaarschuwingen[0]?.minimaleLatereStart, '2029-01-12');
    assert.equal(beoordeelVerhuuraanvraag(input({ historie: [{ ...toekomst, start: '2029-01-12' }] })).historieWaarschuwingen.length, 0);
  });

  test('hoofd- en mede-exposanten worden vergeleken zonder losse namen als bewezen identiteit te behandelen', () => {
    const uit = beoordeelVerhuuraanvraag(input({
      aanvraag: { ...aanvraag, medeExposanten: '["  Noor van Dijk  ","Piet de Vries"]' },
      historie: [historie({ deelnemers: [
        { naam: 'Andere contactpersoon', email: 'KARIN@example.test' },
        { naam: 'NOOR  VAN DIJK' },
        { naam: 'Peter de Vries', aliassen: ['Piet de Vries'] },
      ] })],
    }));
    assert.equal(uit.historieWaarschuwingen.length, 3);
    const karin = uit.historieWaarschuwingen.find((w) => w.rol === 'hoofd');
    assert.equal(karin?.zekerheid, 'mogelijk');
    assert.equal(karin?.grondslag, 'email');
    for (const mede of uit.historieWaarschuwingen.filter((w) => w.rol === 'mede')) {
      assert.equal(mede.zekerheid, 'mogelijk');
      assert.equal(mede.grondslag, 'naam_of_alias');
    }
  });

  test('gelijke naam plus email is waarschijnlijk; expliciet verschillende personen blijven gescheiden', () => {
    const match = historie({ deelnemers: [{ naam: 'Karin Janssen', email: 'karin@example.test' }] });
    assert.equal(beoordeelVerhuuraanvraag(input({ historie: [match] })).historieWaarschuwingen[0]?.zekerheid, 'waarschijnlijk');
    const gescheiden = beoordeelVerhuuraanvraag(input({
      aanvraag: { ...aanvraag, persoonId: 'persoon-a' },
      historie: [historie({ deelnemers: [{ naam: aanvraag.naam, email: aanvraag.email, relatieId: 91, persoonId: 'persoon-b' }] })],
    }));
    assert.deepEqual(gescheiden.historieWaarschuwingen, []);
    const bevestigd = beoordeelVerhuuraanvraag(input({
      aanvraag: { ...aanvraag, medeExposanten: [{ naam: 'Nieuwe artiestennaam', persoonId: 'persoon-n' }] },
      historie: [historie({ deelnemers: [{ naam: 'Oude artiestennaam', persoonId: 'persoon-n' }] })],
    }));
    assert.equal(bevestigd.historieWaarschuwingen[0]?.rol, 'mede');
    assert.equal(bevestigd.historieWaarschuwingen[0]?.grondslag, 'persoon_id');
  });

  test('geannuleerd, afgewezen, eigen dossier en niet-expositie tellen niet als expositiehistorie', () => {
    const uit = beoordeelVerhuuraanvraag(input({ historie: [
      historie({ id: 'ann', status: 'geannuleerd' }),
      historie({ id: 'afw', status: 'afgewezen' }),
      historie({ id: 'eigen', aanvraagId: '17' }),
      historie({ id: 'concert', verhuurtype: 'concert' }),
    ] }));
    assert.deepEqual(uit.historieWaarschuwingen, []);
    assert.deepEqual(beoordeelVerhuuraanvraag(input({ aanvraag: { ...aanvraag, verhuurtype: 'diverse' }, historie: [historie()] })).historieWaarschuwingen, []);
  });

  test('boekings- en importbronnen voor één expositie geven één herleidbare waarschuwing met de sterkste match', () => {
    const uit = beoordeelVerhuuraanvraag(input({ historie: [
      historie({ id: 'import-1', bron: 'import', status: 'migratie_aanvraag', deelnemers: [{ naam: aanvraag.naam }] }),
      historie({ id: 'boek-1', status: 'migratie_vastgelegd' }),
    ] }));
    assert.equal(uit.historieWaarschuwingen.length, 1);
    assert.equal(uit.historieWaarschuwingen[0]?.bronId, 'boek-1');
    assert.equal(uit.historieWaarschuwingen[0]?.zekerheid, 'bevestigd');
    assert.equal(uit.historieWaarschuwingen[0]?.voorlopig, false);
  });

  test('historie is standaard onbekend en een match zonder betrouwbare datum maakt een complete import onvolledig', () => {
    const onbekend = beoordeelVerhuuraanvraag(input({ historieCompleet: undefined }));
    assert.equal(onbekend.historieCompleet, false);
    assert.ok(onbekend.meldingen.some((m) => m.code === 'historie_onvolledig' && m.ernst === 'waarschuwing'));
    assert.equal(onbekend.hardeBlokkade, false);
    const ongedateerd = beoordeelVerhuuraanvraag(input({ historie: [historie({ start: '', eind: '' })] }));
    assert.equal(ongedateerd.historieCompleet, false);
    assert.ok(ongedateerd.meldingen.some((m) => m.code === 'historie_datum_onbekend'));
    assert.equal(ongedateerd.hardeBlokkade, false);
  });

  test('onleesbare mede-exposanten worden geen stilzwijgend complete historische controle', () => {
    const uit = beoordeelVerhuuraanvraag(input({ aanvraag: { ...aanvraag, medeExposanten: '[ongeldige oude invoer' } }));
    assert.equal(uit.historieCompleet, false);
    assert.ok(uit.meldingen.some((m) => m.code === 'historie_onvolledig' && /mede-exposanten/.test(m.tekst)));
    assert.equal(uit.hardeBlokkade, false);
  });
});

describe('prijsafspraak en bindende vingerafdruk', () => {
  test('concert en diverse vragen altijd een concrete prijs, ook als een tariefregel een vast of vanafbedrag bevat', () => {
    for (const verhuurtype of ['concert', 'diverse']) {
      for (const prijstype of ['vast', 'vanaf', 'op_aanvraag'] as const) {
        const prijs = beoordeelHuurprijs({ ...aanvraag, verhuurtype }, { prijstype, bedrag: 75 });
        assert.equal(prijs.vastgesteld, false, `${verhuurtype}/${prijstype}`);
        assert.equal(prijs.bedragCent, null);
        assert.equal(prijs.moetVaststellen, true);
        assert.equal(prijs.indicatieCent, 7500);
      }
    }
  });

  test('een expliciet positief bedrag in centen is bruikbaar; leeg, nul, negatief, NaN en fracties niet', () => {
    const maatwerk = { ...aanvraag, verhuurtype: 'diverse', prijsVastgesteld: true };
    const prijs = beoordeelHuurprijs({ ...maatwerk, prijsAfspraakCent: 12345 });
    assert.equal(prijs.vastgesteld, true);
    assert.equal(prijs.bedragCent, 12345);
    for (const waarde of [undefined, null, 0, -100, NaN, 12.34, 10_000_000_000]) {
      assert.equal(beoordeelHuurprijs({ ...maatwerk, prijsAfspraakCent: waarde }, vastTarief).vastgesteld, false);
    }
    assert.equal(beoordeelHuurprijs({ ...aanvraag, prijsAfspraakCent: 12345, prijsVastgesteld: false }, vastTarief).vastgesteld, false);
  });

  test('ongeldige en verlopen tarieven worden niet stilzwijgend overgenomen', () => {
    for (const tarief of [
      { ...vastTarief, bedrag: 75.123 }, { ...vastTarief, bedrag: 0 },
      { ...vastTarief, geldigTot: '2027-07-09' }, { ...vastTarief, geldigVanaf: '2027-07-11' },
      { ...vastTarief, geldigTot: 'geen datum' },
    ]) assert.equal(beoordeelHuurprijs(aanvraag, tarief).vastgesteld, false);
    assert.equal(beoordeelHuurprijs(aanvraag, { ...vastTarief, geldigVanaf: aanvraag.start, geldigTot: aanvraag.start }).vastgesteld, true);
    assert.equal(beoordeelHuurprijs(aanvraag, { prijstype: 'vanaf', bedrag: 420.50 }).vastgesteld, false);
  });

  test('bronvolgorde en objectvolgorde veranderen de beoordeling niet, materiële wijzigingen wel', () => {
    const aanvragen = [
      { ...aanvraag, id: 18, naam: 'Anna' }, { ...aanvraag, id: 19, naam: 'Bram' },
    ];
    const historiek = [historie(), historie({ id: 'h-2', expositieId: 'b-2', start: '2026-02-01', eind: '2026-02-02' })];
    const a = { ...aanvraag, medeExposanten: [{ naam: 'Anna' }, { naam: 'Bram' }], afspraken: { eindtijd: '17:00', begintijd: '11:00' } };
    const uit = beoordeelVerhuuraanvraag(input({ aanvraag: a, aanvragen, historie: historiek }));
    const omgedraaid = beoordeelVerhuuraanvraag(input({
      aanvraag: { ...a, medeExposanten: [...a.medeExposanten].reverse(), afspraken: { begintijd: '11:00', eindtijd: '17:00' } },
      aanvragen: [...aanvragen].reverse(), historie: [...historiek].reverse(),
    }));
    assert.equal(uit.aanvraagVingerafdruk, omgedraaid.aanvraagVingerafdruk);
    assert.equal(uit.vingerafdruk, omgedraaid.vingerafdruk);
    assert.match(uit.vingerafdruk, /^[a-f0-9]{64}$/);
    assert.equal(beoordelingsVingerafdruk({ a: 1, b: 2 }), beoordelingsVingerafdruk({ b: 2, a: 1 }));
    for (const wijziging of [
      { start: '2027-07-11' }, { medeExposanten: '["Andere exposant"]' },
      { afspraken: { begintijd: '09:00', eindtijd: '17:00' } }, { prijsAfspraakCent: 45000, prijsVastgesteld: true },
    ]) {
      const gewijzigd = beoordeelVerhuuraanvraag(input({ aanvraag: { ...a, ...wijziging }, aanvragen, historie: historiek }));
      assert.notEqual(uit.aanvraagVingerafdruk, gewijzigd.aanvraagVingerafdruk);
      assert.notEqual(uit.vingerafdruk, gewijzigd.vingerafdruk);
    }
    const andereBron = beoordeelVerhuuraanvraag(input({ aanvraag: a, aanvragen, historie: [historie({ referentie: 'Na historisch onderzoek aangepast' }), historiek[1]!] }));
    assert.equal(uit.aanvraagVingerafdruk, andereBron.aanvraagVingerafdruk);
    assert.notEqual(uit.vingerafdruk, andereBron.vingerafdruk);
  });
});
