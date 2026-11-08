import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { weekdag } from '../src/platform/datum.ts';
import { verhuurOverzichtAan } from '../src/platform/verhuur-vlag.ts';
import {
  bouwAgenda,
  bouwDossier,
  bronUitSnapshot,
  contractStatus,
  gastheerBesluit,
  gastheerOverlappen,
  inhoudHash,
  laatsteBeoordeling,
  leesVerhuurSelectie,
  termijnStatus,
  type VerhuurBron,
  type VerhuurBoeking,
} from '../src/platform/verhuur-overzicht.ts';
import type { BeheerSnapshot } from '../src/platform/beheer-bron.ts';

function boeking(deel: Partial<VerhuurBoeking> & Pick<VerhuurBoeking, 'id' | 'start' | 'eind'>): VerhuurBoeking {
  return {
    nummer: deel.id,
    status: 'definitief',
    soort: 'expositie',
    titel: 'Expositie',
    huurder: 'Huurder',
    email: '',
    telefoon: '',
    adres: '',
    relatieId: '',
    gastheerId: '',
    notities: '',
    toelichting: '',
    medeExposanten: '',
    tarief: '',
    aanvraagId: '',
    ...deel,
  };
}

function bron(deel: Partial<VerhuurBron> = {}): VerhuurBron {
  return {
    vandaag: '2026-11-08',
    jaar: 2027,
    maand: 7,
    boekingen: [],
    betalingen: [],
    documenten: [],
    activiteiten: [],
    intern: [],
    relaties: [],
    gastheren: [],
    toewijzingen: [],
    aanvragen: [],
    stukken: [],
    beoordelingen: [],
    verzendingen: [],
    jobs: [],
    audit: [],
    magAudit: false,
    stukkenGeladen: true,
    beoordelingOpslag: true,
    ...deel,
  };
}

test('de vlag staat uit zonder expliciete aanzet en niet in vercel.json', () => {
  assert.equal(verhuurOverzichtAan({}), false);
  assert.equal(verhuurOverzichtAan({ VERHUUR_OVERZICHT: 'false' }), false);
  assert.equal(verhuurOverzichtAan({ VERHUUR_OVERZICHT: 'true' }), true);
  const vercel = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8');
  assert.equal(vercel.includes('VERHUUR_OVERZICHT'), false);
});

test('jaar en maand vallen terug op vandaag', () => {
  assert.deepEqual(leesVerhuurSelectie(new URLSearchParams(), '2026-11-08'), { jaar: 2026, maand: 11 });
  assert.deepEqual(leesVerhuurSelectie(new URLSearchParams('jaar=2027&maand=alle'), '2026-11-08'), { jaar: 2027, maand: 'alle' });
  assert.deepEqual(leesVerhuurSelectie(new URLSearchParams('jaar=99&maand=13'), '2026-11-08'), { jaar: 2026, maand: 11 });
});

test('10 en 11 juli 2027 is een weekend en 8 en 9 mei 2027 blijft vrij', () => {
  assert.equal(weekdag('2027-07-10'), 6);
  assert.equal(weekdag('2027-05-08'), 6);
  const juli = bron({
    boekingen: [
      boeking({ id: '67', start: '2027-07-10', eind: '2027-07-11', huurder: 'Mirjam Withaar', status: 'migratie_vastgelegd', medeExposanten: 'mede' }),
      boeking({ id: '76', start: '2027-07-10', eind: '2027-07-11', huurder: 'Mariet van Hovell', status: 'geannuleerd' }),
    ],
  });
  const rijen = bouwAgenda(juli).filter((rij) => rij.start <= '2027-07-11' && rij.eind >= '2027-07-10');
  assert.equal(rijen.some((rij) => rij.boekingId === '67' && rij.huurder === 'Mirjam Withaar'), true);
  assert.equal(rijen.some((rij) => rij.boekingId === '76'), true);
  assert.equal(rijen.some((rij) => rij.huurder === 'Vrij' && rij.start === '2027-07-10'), false);
  const mei = bouwAgenda(bron({
    jaar: 2027,
    maand: 5,
    boekingen: juli.boekingen,
  }));
  assert.equal(mei.some((rij) => rij.sleutel === 'vrij-2027-05-08' && rij.huurder === 'Vrij'), true);
});

test('een vlag op de boeking beslist niet over de betaling', () => {
  const snapshot = {
    boekingen: [boeking({
      id: '1',
      start: '2027-07-10',
      eind: '2027-07-11',
      status: 'migratie_vastgelegd',
      tarief: '490.00',
      aanbetalingBinnen: false,
    })],
    betalingen: [
      { id: 'a', boekingId: '1', soort: 'aanbetaling', bedrag: 100, status: 'ontvangen', vervaldatum: '2027-01-01', ontvangenOp: '2027-01-02' },
      { id: 'r', boekingId: '1', soort: 'restant', bedrag: 390, status: 'open', vervaldatum: '2026-01-01', ontvangenOp: '' },
    ],
    documenten: [],
    agenda: [],
    intern: [],
    relaties: [],
    gastheren: [],
    aanvragen: [],
    communicatie: [],
    vrienden: [],
    nieuwsbrieven: [],
    templates: [],
    instellingen: { optietermijn: 0, betaaltermijn: 0, aanbetaling: 0, contractbeheerder: '', openingVan: '', openingTot: '', ontvangstAdres: '', extraOntvangstAdres: '', penningmeesterAdres: '', socialMediaEmail: '' },
    banner: '',
    reden: '',
    bron: 'supabase',
    migratie: null,
  } as unknown as BeheerSnapshot;
  const afgeleid = bronUitSnapshot(snapshot, {
    vandaag: '2026-11-08',
    jaar: 2027,
    maand: 7,
    stukken: [],
    beoordelingen: [],
    verzendingen: [],
    audit: [],
    magAudit: false,
    stukkenGeladen: true,
    beoordelingOpslag: true,
  });
  const rij = bouwAgenda(afgeleid).find((item) => item.boekingId === '1');
  assert.equal(rij?.aanbetaling.tekst, 'Ontvangen');
  assert.equal(rij?.aanbetaling.toon, 'klaar');
  assert.equal(rij?.restant.tekst, 'Te laat');
  assert.equal(rij?.restant.toon, 'actie');
  const vlagZonderRegels = bronUitSnapshot({
    ...snapshot,
    boekingen: [{
      ...(snapshot.boekingen as unknown[])[0],
      id: '9',
      aanbetalingBinnen: true,
    }],
    betalingen: [],
  } as unknown as BeheerSnapshot, {
    vandaag: '2026-11-08',
    jaar: 2027,
    maand: 7,
    stukken: [],
    beoordelingen: [],
    verzendingen: [],
    audit: [],
    magAudit: false,
    stukkenGeladen: true,
    beoordelingOpslag: true,
  });
  const zonderVlag = bouwAgenda(vlagZonderRegels).find((item) => item.boekingId === '9');
  assert.equal(zonderVlag?.aanbetaling.toon, 'onbekend');
  assert.notEqual(zonderVlag?.aanbetaling.toon, 'klaar');
  const zonderRegels = bouwAgenda(bron({
    boekingen: [boeking({ id: '2', start: '2027-07-17', eind: '2027-07-18', status: 'definitief' })],
  })).find((item) => item.boekingId === '2');
  assert.equal(zonderRegels?.aanbetaling.toon, 'onbekend');
  assert.notEqual(zonderRegels?.aanbetaling.toon, 'klaar');
  assert.equal(termijnStatus([{ boekingId: '2', soort: 'aanbetaling', bedrag: 1, status: 'mysterie', vervaldatum: '', ontvangenOp: '' }], '2026-11-08').toon, 'onbekend');
});

test('importtekst is geen ondertekend contract', () => {
  const huidig = bron({
    boekingen: [boeking({ id: '67', start: '2027-07-10', eind: '2027-07-11', status: 'migratie_vastgelegd' })],
  });
  assert.equal(contractStatus(huidig, huidig.boekingen[0]).tekst, 'Status onbekend');
  assert.notEqual(contractStatus(huidig, huidig.boekingen[0]).toon, 'klaar');
  const optie = boeking({ id: '3', start: '2027-07-10', eind: '2027-07-11', status: 'optie' });
  assert.equal(contractStatus(bron({ boekingen: [optie] }), optie).tekst, 'Ontbreekt');
  const metDocument = bron({
    boekingen: [optie],
    documenten: [{ id: 'd', boekingId: '3', naam: 'contract.pdf', soort: 'contract', url: '' }],
  });
  assert.equal(contractStatus(metDocument, optie).tekst, 'Voorbereid');
  const getekend = bron({
    boekingen: [optie],
    documenten: [{ id: 'd', boekingId: '3', naam: 'getekend.pdf', soort: 'getekend_contract', url: 'https://voorbeeld.test/getekend.pdf' }],
  });
  assert.equal(contractStatus(getekend, optie).tekst, 'Ondertekend');
  const mailZonderBewijs = bron({
    boekingen: [optie],
    jobs: [{ boekingId: '3', template: 'contract', status: 'verzonden', wanneer: '2026-11-01' }],
  });
  assert.notEqual(contractStatus(mailZonderBewijs, optie).tekst, 'Verstuurd');
  const bewijs = bron({
    boekingen: [optie],
    verzendingen: [{ boekingId: '3', status: 'verzonden', verzondenOp: '2026-11-01', test: false, contract: true }],
  });
  assert.equal(contractStatus(bewijs, optie).tekst, 'Verstuurd');
});

test('een nieuwe versie maakt een oude goedkeuring ongeldig', () => {
  const stuk = {
    bron: 'aanvraag_foto' as const,
    bronId: '9',
    versie: 'pad-nieuw',
    boekingId: '1',
    titel: 'Foto',
    soort: 'foto' as const,
    url: '',
    tekst: '',
  };
  const oud = laatsteBeoordeling([
    { boekingId: '1', bron: 'aanvraag_foto', bronId: '9', versie: 'pad-oud', status: 'goedgekeurd', reden: '', door: 'Ans', op: '2026-11-01T10:00:00Z' },
  ], stuk);
  assert.equal(oud, null);
  const expositie = boeking({ id: '1', start: '2026-12-12', eind: '2026-12-13', status: 'definitief', soort: 'expositie' });
  const overzicht = bron({
    vandaag: '2026-11-08',
    jaar: 2026,
    maand: 12,
    boekingen: [expositie],
    stukken: [
      stuk,
      { bron: 'aanvraag_tekst', bronId: '1', versie: 'abc', boekingId: '1', titel: 'Toelichting', soort: 'tekst', url: '', tekst: 'Keramiek' },
    ],
    beoordelingen: [
      { boekingId: '1', bron: 'aanvraag_foto', bronId: '9', versie: 'pad-oud', status: 'goedgekeurd', reden: '', door: 'Ans', op: '2026-11-01' },
      { boekingId: '1', bron: 'aanvraag_tekst', bronId: '1', versie: 'abc', status: 'goedgekeurd', reden: '', door: 'Ans', op: '2026-11-01' },
    ],
  });
  const rij = bouwAgenda(overzicht).find((item) => item.boekingId === '1');
  assert.equal(rij?.stukken.tekst, 'Te beoordelen');
  assert.notEqual(rij?.stukken.toon, 'klaar');
  const dossier = bouwDossier(overzicht, '1');
  assert.equal(dossier?.stukken[0].status.tekst, 'Te beoordelen');
  assert.equal(dossier?.aandacht.some((punt) => punt.tekst.includes('nog beoordelen')), true);
  assert.notEqual(inhoudHash('eerste tekst'), inhoudHash('tweede tekst'));
});

test('winterstop, doordeweekse verhuur en dubbele boeking blijven zichtbaar', () => {
  const overzicht = bron({
    jaar: 2026,
    maand: 12,
    vandaag: '2026-11-08',
    boekingen: [
      boeking({ id: 'br', start: '2026-12-16', eind: '2026-12-16', soort: 'bruiloft', status: 'definitief', huurder: 'Bruidspaar' }),
      boeking({ id: 'a', start: '2026-12-05', eind: '2026-12-06', status: 'optie', huurder: 'Eerste' }),
      boeking({ id: 'b', start: '2026-12-05', eind: '2026-12-06', status: 'definitief', huurder: 'Tweede' }),
    ],
    intern: [{ id: 'w', titel: 'Winterstop', start: '2026-12-19', eind: '2027-02-14', blokkeert: true }],
  });
  const rijen = bouwAgenda(overzicht);
  assert.equal(rijen.some((rij) => rij.boekingId === 'br' && rij.activiteit.includes('Bruiloft')), true);
  assert.equal(rijen.some((rij) => rij.activiteit === 'Winterstop' && rij.huurder === 'Geen verhuur'), true);
  const dubbel = bouwDossier(overzicht, 'a');
  assert.equal(dubbel?.aandacht.some((punt) => punt.tekst === 'Mogelijke dubbele boeking'), true);
  assert.equal(dubbel?.samenvatting.includes('aandacht'), true);
});

test('gastheer toevoegen vraagt bij vervanging en overlap, en voorkomt een dubbele keuze', () => {
  const overzicht = bron({
    boekingen: [
      boeking({ id: '1', start: '2027-07-10', eind: '2027-07-11', gastheerId: '4', huurder: 'Mirjam' }),
      boeking({ id: '2', start: '2027-07-10', eind: '2027-07-11', gastheerId: '8', huurder: 'Ander', status: 'definitief' }),
    ],
    gastheren: [
      { id: '4', naam: 'Hans', actief: true },
      { id: '8', naam: 'Betty', actief: true },
      { id: '9', naam: 'Oud', actief: false },
    ],
  });
  assert.deepEqual(gastheerOverlappen(overzicht, overzicht.boekingen[0], '8'), ['Ander']);
  assert.equal(gastheerBesluit({ actie: 'toevoegen', gekozenId: '4', huidigeId: '4', overlap: false, bevestigd: false }).melding.includes('staat al'), true);
  const vervangen = gastheerBesluit({ actie: 'toevoegen', gekozenId: '8', huidigeId: '4', overlap: true, bevestigd: false });
  assert.equal(vervangen.doen, 'vragen');
  assert.equal(vervangen.vraag, 'vervangen-overlap');
  const bevestigd = gastheerBesluit({ actie: 'bevestigen', gekozenId: '8', huidigeId: '4', overlap: true, bevestigd: true });
  assert.equal(bevestigd.doen, 'opslaan');
  assert.equal(bevestigd.gastheerId, '8');
  const wissen = gastheerBesluit({ actie: 'verwijderen', gekozenId: '', huidigeId: '4', overlap: false, bevestigd: false });
  assert.equal(wissen.vraag, 'verwijderen');
  assert.equal(gastheerBesluit({ actie: 'bevestigen', gekozenId: '', huidigeId: '4', overlap: false, bevestigd: true }).gastheerId, '');
  const dossier = bouwDossier(overzicht, '1');
  assert.deepEqual(dossier?.gastheren.keuzes.map((item) => item.id), ['4', '8']);
  assert.equal(dossier?.huurder.some((regel) => regel.label === 'Mede-exposanten'), true);
});

test('een kijkrol ziet audit niet en een beheerder wel', () => {
  const basis = bron({
    boekingen: [boeking({ id: '1', start: '2027-07-10', eind: '2027-07-11', relatieId: '3', huurder: 'Mirjam', telefoon: '06 boeking', email: 'boeking@example.test' })],
    relaties: [{ id: '3', naam: 'Mirjam Relatie', organisatie: 'Atelier', email: 'relatie@example.test', telefoon: '06 relatie', adres: 'Dorpsstraat 1', notities: 'Belt het liefst \'s ochtends' }],
    audit: [{ boekingId: '1', actie: 'gastheer_gekoppeld', wanneer: '2026-11-04', actor: 'Nick', reden: '' }],
    magAudit: false,
  });
  assert.equal(bouwDossier(basis, '1')?.historie.some((item) => item.tekst.includes('gastheer_gekoppeld')), false);
  assert.equal(bouwDossier({ ...basis, magAudit: true }, '1')?.historie.some((item) => item.tekst.includes('gastheer_gekoppeld')), true);
  const regels = bouwDossier(basis, '1')?.huurder ?? [];
  assert.equal(regels.find((regel) => regel.label === 'Telefoon bij deze boeking')?.waarde, '06 boeking');
  assert.equal(regels.find((regel) => regel.label === 'Telefoon bij de relatie')?.waarde, '06 relatie');
});
