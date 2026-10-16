import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { formatActiviteitTitel, titelZonderExpositiePrefix } from '../src/platform/activiteit-titel.ts';
import { formatExposantenWeergave, parseExposanten, serializeExposanten } from '../src/platform/exposanten.ts';
import {
  GASTHEER_VERWIJDER_BEVESTIG,
  GASTHEER_VERWIJDER_GEKOPPELD,
  beoordeelGastheerVerwijdering,
  filterGastheren,
  gastherenVoorKoppeling,
} from '../src/platform/gastheer-lijst.ts';
import { STANDAARD_AUTOMATISERINGEN, magAutomatiseringUitvoeren } from '../src/platform/automatisering.ts';
import {
  planSocialMediaVerzending,
  socialMediaDedup,
  leesSocialMediaEmail,
  SOCIAL_MEDIA_SLOT,
} from '../src/platform/social-media-content.ts';
import { verstuurSocialMediaInhoud } from '../src/lib/social-media-versturen.ts';
import { valideerIntakeBestand } from '../src/platform/intake-foto.ts';
import { beoordeelPortaalToken, portaalMagPubliceren, uploadToegestaan } from '../src/platform/exposant-portaal.ts';
import { hashToegangstoken, nieuwToegangstoken } from '../src/platform/magictoken.ts';
import { legeWereld, voerOpdrachtUit, type DienstContext, type Wereld } from '../src/lib/operatie/kern.ts';
import { verwijderGastheer, zetGastheerActief } from '../src/lib/operatie/gastheer-stam.ts';
import { activiteitVanAgendaRij, type AgendaRij } from '../src/lib/publiek-lezen.ts';

const nu = new Date('2026-10-16T10:00:00Z');

function ctx(): DienstContext {
  return {
    nu,
    env: {},
    actor: { type: 'gebruiker', naam: 'Nick', id: '11111111-1111-1111-1111-111111111111', rechten: { isSuperAdmin: true, perModule: {} } },
    basisUrl: 'https://kerkjepersingen.nl',
    internEmail: 'bestuur@example.test',
  };
}

function dossier(verhuurtype = 'expositie', praktisch = 'Parkeren aan de overkant.'): { wereld: Wereld; plain: string } {
  const token = nieuwToegangstoken();
  const wereld = legeWereld();
  wereld.boekingen.push({
    id: '42',
    nummer: '2026-042',
    status: 'definitief',
    verhuurtype,
    titel: 'Intern',
    start: '2026-10-03',
    eind: '2026-10-04',
    relatieId: null,
    gastheerId: '9',
    aanvraagId: null,
    naam: 'Ada',
    email: 'ada@example.test',
    telefoon: '',
    adres: '',
    aanbetalingBedrag: 0,
    aanbetalingOntvangen: false,
    optieAangemaaktOp: null,
    optieEind: null,
  });
  wereld.publiek.push({
    id: '7',
    boekingId: '42',
    titel: 'Oud',
    slug: 'oud',
    omschrijving: '',
    start: '2026-10-03',
    eind: '2026-10-04',
    trigger: 'zodra_content_compleet',
    gepubliceerd: false,
    inhoudStatus: 'gevraagd',
    praktisch,
    versie: 1,
    foto: false,
    fotoPad: '',
    toelichting: '',
  });
  wereld.tokens.push({
    id: '1',
    boekingId: '42',
    aanvraagId: null,
    doel: 'content',
    tokenHash: token.hash,
    verlooptOp: '2026-12-01T00:00:00Z',
    ingetrokkenOp: null,
  });
  return { wereld, plain: token.plain };
}

function inhoud(extra: Partial<Parameters<typeof planSocialMediaVerzending>[0]> = {}) {
  return {
    boekingId: '42',
    versie: 3,
    goedgekeurd: true,
    soort: 'expositie',
    titel: 'Second Nature',
    start: '2026-10-03',
    eind: '2026-10-04',
    exposanten: 'Judith Aardse\nGea van Eck',
    korteTekst: 'Korte tekst over de expositie.',
    langeTekst: 'Uitgebreide tekst over het verhaal.',
    fotos: [{ label: 'Hoofdafbeelding', url: 'https://example.test/signed' }],
    beheerUrl: 'https://kerkjepersingen.nl/beheer/boekingen/42/',
    ontvanger: 'social@example.test',
    alVerstuurd: false,
    ...extra,
  };
}

test('expositietitel krijgt precies één voorvoegsel', () => {
  assert.equal(formatActiviteitTitel('expositie', 'Second Nature'), 'Expositie: Second Nature');
  assert.equal(formatActiviteitTitel('expositie', 'Expositie: Second Nature'), 'Expositie: Second Nature');
  assert.equal(formatActiviteitTitel('expositie', 'EXPOSITIE: Second Nature'), 'Expositie: Second Nature');
  assert.equal(formatActiviteitTitel('expositie', 'Expositie: Expositie: Second Nature'), 'Expositie: Second Nature');
  assert.equal(formatActiviteitTitel('expositie', 'Expositie Hans Peters icm Ineke Christiaans'), 'Expositie: Hans Peters icm Ineke Christiaans');
  assert.equal(titelZonderExpositiePrefix('EXPOSITIE: Second Nature'), 'Second Nature');
  assert.equal(formatActiviteitTitel('concert', 'Second Nature'), 'Second Nature');
  assert.equal(formatActiviteitTitel('bruiloft', 'Expositie: Second Nature'), 'Expositie: Second Nature');
  const rij: AgendaRij = {
    id: 1,
    slug: 'second-nature',
    titel: 'Second Nature',
    start_datum: '2026-10-03',
    eind_datum: '2026-10-04',
    omschrijving: null,
    foto_pad: null,
    foto_alt: null,
    publicatie_trigger: 'direct',
    zichtbaarheid: 'publiek',
    inhoud_status: 'goedgekeurd',
    soort: 'expositie',
    exposanten: 'Judith Aardse\nGea van Eck\nMonika Loster',
  };
  const item = activiteitVanAgendaRij(rij);
  assert.equal(item.publiekeTitel, 'Expositie: Second Nature');
  assert.equal(item.kunstenaars, 'Judith Aardse, Gea van Eck, Monika Loster');
  assert.equal(activiteitVanAgendaRij({ ...rij, soort: 'concert', titel: 'Orgelmiddag' }).publiekeTitel, 'Orgelmiddag');
});

test('exposanten blijven apart, bewerkbaar en in volgorde', () => {
  const namen = ['Judith Aardse', 'Gea van Eck', 'Monika Loster', 'Judith Schepers'];
  const opgeslagen = serializeExposanten(namen);
  assert.deepEqual(parseExposanten(opgeslagen), namen);
  const zonderDerde = parseExposanten(opgeslagen).filter((naam) => naam !== 'Monika Loster');
  zonderDerde[1] = 'Gea van Eck-bijgewerkt';
  assert.deepEqual(parseExposanten(serializeExposanten(zonderDerde)), ['Judith Aardse', 'Gea van Eck-bijgewerkt', 'Judith Schepers']);
  assert.equal(parseExposanten('Hans Peters en Ineke Christiaans').join('|'), 'Hans Peters en Ineke Christiaans');
  assert.equal(formatExposantenWeergave('Hans Peters en Ineke Christiaans'), 'Hans Peters en Ineke Christiaans');
});

test('externe intake bewaart praktische informatie en exposanten', async () => {
  const { wereld, plain } = dossier();
  const uit = await voerOpdrachtUit(wereld, {
    soort: 'content_indienen',
    token: plain,
    titel: 'Expositie: Second Nature',
    omschrijving: 'Kort\n\nLang',
    praktisch: 'Dit mag niet overschreven worden',
    exposanten: 'Judith Aardse\nGea van Eck',
    korteTekst: 'Kort',
    langeTekst: 'Lang',
  }, ctx());
  assert.equal(uit.resultaat.ok, true);
  const mutatie = uit.mutaties.find((item) => item.soort === 'upsert_publiek');
  assert.equal(mutatie?.velden?.praktische_informatie, undefined);
  assert.equal(mutatie?.velden?.titel, 'Second Nature');
  assert.equal(mutatie?.velden?.exposanten, 'Judith Aardse\nGea van Eck');
  assert.equal(uit.wereld.publiek[0].praktisch, 'Parkeren aan de overkant.');
  assert.equal(uit.wereld.publiek[0].titel, 'Second Nature');
  assert.equal(uit.wereld.publiek[0].exposanten, 'Judith Aardse\nGea van Eck');
  assert.equal(uit.wereld.publiek[0].inhoudStatus, 'ingediend');

  const concert = dossier('concert', 'Blijft staan');
  const concertUit = await voerOpdrachtUit(concert.wereld, {
    soort: 'content_indienen',
    token: concert.plain,
    titel: 'Expositie: Niet prefixen',
    omschrijving: 'Tekst',
    praktisch: 'weg',
  }, ctx());
  assert.equal(concertUit.wereld.publiek[0].titel, 'Expositie: Niet prefixen');
  assert.equal(concertUit.wereld.publiek[0].praktisch, 'Blijft staan');
});

test('ongeldig of verlopen token en een afgekeurd bestand schrijven niets', async () => {
  const { wereld } = dossier();
  const ongeldig = await voerOpdrachtUit(wereld, {
    soort: 'content_indienen',
    token: 'geen-token',
    titel: 'Nieuw',
    omschrijving: 'Tekst',
    praktisch: 'weg',
  }, ctx());
  assert.equal(ongeldig.resultaat.ok, false);
  assert.equal(ongeldig.wereld.publiek[0].titel, 'Oud');
  assert.equal(ongeldig.wereld.publiek[0].praktisch, 'Parkeren aan de overkant.');
  const verlopen = structuredClone(wereld);
  verlopen.tokens[0].verlooptOp = '2020-01-01T00:00:00Z';
  const plain = 'verlopen-maar-hash-klopt-niet';
  verlopen.tokens[0].tokenHash = hashToegangstoken('andere-waarde');
  const teLaat = await voerOpdrachtUit(verlopen, {
    soort: 'content_indienen',
    token: plain,
    titel: 'Nieuw',
    omschrijving: 'Tekst',
  }, ctx());
  assert.equal(teLaat.resultaat.ok, false);
  assert.equal(teLaat.mutaties.length, 0);
  assert.equal(valideerIntakeBestand({ type: 'application/pdf', size: 20 }).ok, false);
  assert.equal(valideerIntakeBestand({ type: 'image/png', size: 8_000_001 }).ok, false);
  assert.equal(uploadToegestaan('image/gif', 100), false);
  assert.equal(portaalMagPubliceren(), false);
  assert.equal(beoordeelPortaalToken({
    hash: 'x',
    doel: 'content',
    boekingId: '42',
    verlooptOp: '2020-01-01T00:00:00Z',
    ingetrokkenOp: null,
  }, nu).ok, false);
});

test('gastheren: filter, historische koppeling en verwijderen', async () => {
  const lijst = [
    { id: '1', naam: 'Actief', actief: true },
    { id: '2', naam: 'Rust', actief: false },
  ];
  assert.deepEqual(filterGastheren(lijst, 'actief').map((item) => item.id), ['1']);
  assert.deepEqual(filterGastheren(lijst, 'inactief').map((item) => item.id), ['2']);
  assert.equal(filterGastheren(lijst, 'alles').length, 2);
  assert.deepEqual(gastherenVoorKoppeling(lijst, null).map((item) => item.id), ['1']);
  assert.deepEqual(gastherenVoorKoppeling(lijst, '2').map((item) => item.id), ['1', '2']);
  assert.equal(beoordeelGastheerVerwijdering({ boekingenAlsGastheer: 1, toewijzingen: 0, overige: 0 }).mag, false);
  assert.equal(beoordeelGastheerVerwijdering({ boekingenAlsGastheer: 0, toewijzingen: 2, overige: 0 }).mag, false);
  assert.match(GASTHEER_VERWIJDER_GEKOPPELD, /niet worden verwijderd/);
  assert.match(GASTHEER_VERWIJDER_BEVESTIG, /definitief wilt verwijderen/);
  assert.equal(beoordeelGastheerVerwijdering({ boekingenAlsGastheer: 0, toewijzingen: 0, overige: 0 }).mag, true);

  const audits: string[] = [];
  const tabellen = new Map<string, { kolom: string; id: number }[]>([
    ['boekingen', []],
    ['gastbegeleider_toewijzingen', []],
    ['aanvragen', []],
    ['communicatie_jobs', []],
    ['communicatie_verzendingen', []],
  ]);
  let rollen = [{ rol: 'gastheer' }];
  let verwijderd = false;
  const client = {
    from(tabel: string) {
      return {
        select() {
          return {
            eq(kolom: string, id: number) {
              const antwoord = {
                data: tabel === 'relatie_rollen' ? rollen : (tabellen.get(tabel) ?? []).filter((rij) => rij.kolom === kolom && rij.id === id),
                error: null,
                eq() {
                  return Promise.resolve({ data: [], error: null });
                },
              };
              return Object.assign(Promise.resolve({ data: antwoord.data, error: null }), antwoord);
            },
          };
        },
        update(waarden: { actief?: boolean }) {
          return {
            eq() {
              return {
                eq() {
                  if (tabel === 'relatie_rollen' && waarden.actief === false) rollen = [{ rol: 'gastheer' }];
                  return Promise.resolve({ error: null });
                },
              };
            },
          };
        },
        delete() {
          return {
            eq(_kolom: string, _id: number) {
              const stap = {
                eq() {
                  rollen = [];
                  return Promise.resolve({ error: null });
                },
                then(resolve: (waarde: { error: null }) => void) {
                  verwijderd = true;
                  resolve({ error: null });
                },
              };
              return stap;
            },
          };
        },
        insert(rij: { actie?: string }) {
          if (rij.actie) audits.push(rij.actie);
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  const actor = { type: 'gebruiker' as const, naam: 'Nick', rechten: { isSuperAdmin: true, perModule: {} } };
  const uit = await zetGastheerActief(client as never, 5, false, actor);
  assert.equal(uit.ok, true);
  assert.equal(audits.includes('gastheer_inactief'), true);
  rollen = [{ rol: 'gastbegeleider' }];
  const bestaand = await zetGastheerActief(client as never, 5, false, actor);
  assert.equal(bestaand.ok, true);
  assert.equal(verwijderd, false);
  assert.equal(verwijderd, false);
  const aan = await zetGastheerActief(client as never, 5, true, actor);
  assert.equal(aan.ok, true);
  assert.equal(audits.includes('gastheer_actief'), true);
  tabellen.set('boekingen', [{ kolom: 'gastheer_relatie_id', id: 5 }]);
  const geweigerd = await verwijderGastheer(client as never, 5, actor, true);
  assert.equal(geweigerd.ok, false);
  assert.match(geweigerd.melding, /niet worden verwijderd/);
  assert.equal(verwijderd, false);
  tabellen.set('boekingen', []);
  const weg = await verwijderGastheer(client as never, 5, actor, true);
  assert.equal(weg.ok, true);
  assert.equal(verwijderd, true);
  assert.equal(rollen.length, 0);
  assert.equal(audits.includes('gastheer_verwijderd'), true);
});

test('social media blijft dicht tot goedkeuring en dedupliceert per versie', async () => {
  assert.equal(magAutomatiseringUitvoeren('social_media_content').provider, false);
  assert.equal(STANDAARD_AUTOMATISERINGEN.find((item) => item.sleutel === 'social_media_content')?.status, 'uit');
  assert.equal(socialMediaDedup('42', 3), 'social-media:42:3');
  assert.deepEqual(leesSocialMediaEmail('  Social@Example.test '), { ok: true, adres: 'social@example.test' });
  assert.equal(leesSocialMediaEmail('').ok, true);
  assert.equal(leesSocialMediaEmail('a@b.nl, c@d.nl').ok, false);
  assert.equal(leesSocialMediaEmail('geen-adres').ok, false);

  const uitBesluit = magAutomatiseringUitvoeren('social_media_content');
  let provider = 0;
  const transport = {
    async verstuur() {
      provider += 1;
      return 'mock';
    },
  };
  const uit = await verstuurSocialMediaInhoud(inhoud(), { besluit: uitBesluit, transport, testadres: 'nhoevenaars@gmail.com' });
  assert.equal(uit.providerAangeroepen, false);
  assert.equal(provider, 0);

  const testBesluit = { ...uitBesluit, uitvoeren: true, provider: true, status: 'test' as const, modus: 'test' as const, reden: 'testmodus' };
  const testMail = await verstuurSocialMediaInhoud(inhoud(), { besluit: testBesluit, transport, testadres: 'nhoevenaars@gmail.com' });
  assert.equal(testMail.providerAangeroepen, true);
  assert.equal(testMail.werkelijkeOntvanger, 'nhoevenaars@gmail.com');
  assert.equal(testMail.bedoeldeOntvanger, 'social@example.test');
  assert.equal(provider, 1);

  const plan = planSocialMediaVerzending(inhoud(), testBesluit);
  assert.match(plan.bericht?.onderwerp ?? '', /Goedgekeurde content - Expositie: Second Nature - 3 en 4 oktober 2026/);
  assert.match(plan.bericht?.html ?? '', /data-kerkje-mail/);
  assert.match(plan.bericht?.tekst ?? '', new RegExp(SOCIAL_MEDIA_SLOT.replace(/[.]/g, '\\.')));
  assert.match(plan.bericht?.tekst ?? '', /tijdelijk/);
  assert.equal(plan.bericht?.naar, 'social@example.test');

  const leeg = await verstuurSocialMediaInhoud(inhoud({ ontvanger: '   ' }), { besluit: testBesluit, transport, testadres: 'nhoevenaars@gmail.com' });
  assert.equal(leeg.providerAangeroepen, false);
  const ongeldig = await verstuurSocialMediaInhoud(inhoud({ ontvanger: 'twee@example.test, drie@example.test' }), { besluit: testBesluit, transport, testadres: 'nhoevenaars@gmail.com' });
  assert.equal(ongeldig.providerAangeroepen, false);
  const nietKlaar = await verstuurSocialMediaInhoud(inhoud({ goedgekeurd: false }), { besluit: testBesluit, transport, testadres: 'nhoevenaars@gmail.com' });
  assert.equal(nietKlaar.providerAangeroepen, false);
  const dubbel = await verstuurSocialMediaInhoud(inhoud({ alVerstuurd: true }), { besluit: testBesluit, transport, testadres: 'nhoevenaars@gmail.com' });
  assert.equal(dubbel.providerAangeroepen, false);
  const nieuweVersie = await verstuurSocialMediaInhoud(inhoud({ versie: 4, alVerstuurd: false }), { besluit: testBesluit, transport, testadres: 'nhoevenaars@gmail.com' });
  assert.equal(nieuweVersie.providerAangeroepen, true);
  assert.equal(nieuweVersie.dedup, 'social-media:42:4');

  const aanBesluit = { ...uitBesluit, uitvoeren: true, provider: true, status: 'actief' as const, modus: 'aan' as const, reden: 'actief' };
  const aan = await verstuurSocialMediaInhoud(inhoud(), { besluit: aanBesluit, transport, testadres: 'nhoevenaars@gmail.com' });
  assert.equal(aan.werkelijkeOntvanger, 'social@example.test');
  assert.equal(aan.providerAangeroepen, true);
  assert.equal(provider, 3);
});

test('formulier, migratie en bestaande schakelaars blijven veilig', () => {
  const formulier = readFileSync(new URL('../src/pages/klant/aanleveren.astro', import.meta.url), 'utf8');
  assert.equal(formulier.includes('name="praktisch"'), false);
  assert.match(formulier, /Vul alleen de naam van de expositie in/);
  assert.match(formulier, /Voeg hier alle exposanten of kunstenaars toe/);
  assert.match(formulier, /agenda pagina/);
  assert.match(formulier, /persoonlijke expositie pagina/);
  assert.match(formulier, /scherpe beelden van goede kwaliteit/);
  assert.match(formulier, /valideerIntakeBestand/);
  assert.match(formulier, /dossierVanIntakeToken/);
  assert.match(formulier, /portaalTeVaak/);
  assert.equal(formulier.includes('praktische_informatie'), false);

  const sql = readFileSync(new URL('../supabase/migrations/20261016120000_demo_feedback_ronde_1.sql', import.meta.url), 'utf8');
  const laag = sql.toLowerCase();
  assert.equal(laag.includes('delete '), false);
  assert.equal(laag.includes('truncate'), false);
  assert.equal(laag.includes('drop table'), false);
  assert.equal(laag.includes('update public.automatiseringen'), false);
  assert.match(sql, /on conflict \(sleutel\) do nothing/i);
  assert.match(sql, /'social_media_content'/);
  assert.match(sql, /'uit'/);
  assert.equal(STANDAARD_AUTOMATISERINGEN.find((item) => item.sleutel === 'aanvraag_bestuur')?.status, 'actief');
  assert.equal(STANDAARD_AUTOMATISERINGEN.find((item) => item.sleutel === 'contact_bestuur')?.status, 'actief');
  assert.equal(STANDAARD_AUTOMATISERINGEN.find((item) => item.sleutel === 'mailtemplate_test')?.status, 'test');
  assert.equal(STANDAARD_AUTOMATISERINGEN.find((item) => item.sleutel === 'workflow')?.status, 'uit');
  assert.equal(STANDAARD_AUTOMATISERINGEN.find((item) => item.sleutel === 'social_media_content')?.status, 'uit');
});
