import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { STANDAARD_AUTOMATISERINGEN } from '../src/platform/automatisering.ts';
import {
  conceptIsOpTijd,
  conceptMaandagen,
  conceptStatusLabel,
  isNieuwsbriefVervolgmoment,
  isNieuwsbriefVerzendmoment,
  kortNieuwsVoorConcept,
  nieuwsbrievenOpDatum,
  verzendMoment,
  type ConceptBron,
} from '../src/lib/nieuwsbrief-concepten.ts';
import { WINTERSTOP_TEKST } from '../src/lib/winterstop.ts';
import { geheugenNieuwsbrief, vulNieuwsbriefConcepten } from '../src/lib/nieuwsbrief-supabase.ts';
import { verstuurWekelijkseNieuwsbrief } from '../src/lib/nieuwsbrief.ts';
import { geheugenVrienden, type Vriend } from '../src/lib/vrienden-supabase.ts';

const VANDAAG = '2026-11-17';
const PROGRAMMA: ConceptBron[] = [
  {
    titel: 'Gedroomde realiteit',
    start: '2026-11-21',
    eind: '2026-11-22',
    tekst: 'Wybe de Greef. Expositie van schilderijen. Licht, leven en landschap.',
    winterstop: false,
  },
  {
    titel: 'Lindsay Cillessen & Nick Cillessen',
    start: '2026-11-28',
    eind: '2026-11-29',
    tekst: 'Lindsay Cillessen (fotografie) & Nick Cillessen (schilderkunst) nodigen u uit voor de expositie in het kerkje van Persingen.',
    winterstop: false,
  },
  {
    titel: 'Fusion',
    start: '2026-12-05',
    eind: '2026-12-06',
    tekst: 'Marion Groenenberg, Elin Bennaars en Sientje Menheere. Ontdek het werk van de drie kunstenaars ieder met hun eigen materiaal, techniek en signatuur.',
    winterstop: false,
  },
  {
    titel: 'Verbeelding in verf, klei en staal',
    start: '2026-12-12',
    eind: '2026-12-13',
    tekst: "Ilse Aarsman: schilderijen. Nienke Faber: keramische sculpturen. Piet van der Horst: sculpturen van staal en foto's.",
    winterstop: false,
  },
  {
    titel: 'Winterstop',
    start: '2026-12-19',
    eind: '2027-02-11',
    tekst: WINTERSTOP_TEKST,
    winterstop: true,
  },
];

const VRIEND: Vriend = {
  _id: '1',
  naam: 'Bo',
  email: 'bo@example.test',
  actief: true,
  frequentie: 'wekelijks',
  uitschrijfToken: 'tok-1',
};

test('concepten dekken deze week en vier weken daarna', () => {
  assert.deepEqual(conceptMaandagen(VANDAAG), [
    '2026-11-16',
    '2026-11-23',
    '2026-11-30',
    '2026-12-07',
    '2026-12-14',
  ]);
});

test('een concept is pas op tijd vier weken voor de woensdag', () => {
  assert.equal(conceptIsOpTijd('2026-11-17', '2026-11-16'), false);
  assert.equal(conceptIsOpTijd('2026-11-17', '2026-12-07'), false);
  assert.equal(conceptIsOpTijd('2026-11-17', '2026-12-14'), true);
  assert.equal(conceptIsOpTijd('2026-11-19', '2026-12-14'), false);
  assert.equal(conceptIsOpTijd(undefined, '2026-12-14'), false);
});

test('kort nieuws komt uit het programma van die week', () => {
  assert.match(kortNieuwsVoorConcept('2026-11-16', PROGRAMMA), /Gedroomde realiteit/);
  assert.match(kortNieuwsVoorConcept('2026-11-23', PROGRAMMA), /^Lindsay Cillessen & Nick Cillessen/);
  assert.match(kortNieuwsVoorConcept('2026-11-30', PROGRAMMA), /^Fusion\. Marion Groenenberg/);
  assert.equal(kortNieuwsVoorConcept('2026-12-14', PROGRAMMA), WINTERSTOP_TEKST);
  assert.equal(kortNieuwsVoorConcept('2026-10-05', PROGRAMMA), '');
});

test('de lijst noemt de eerstvolgende maandag en 10:30', () => {
  assert.deepEqual(verzendMoment('2026-11-17'), { datum: '2026-11-23', uur: '10:30' });
  assert.deepEqual(verzendMoment('2026-11-30'), { datum: '2026-11-30', uur: '10:30' });
  assert.deepEqual(verzendMoment('2026-07-01'), { datum: '2026-07-06', uur: '10:30' });
  assert.equal(verzendMoment('2026-11-27').datum, '2026-11-30');
});

test('alleen maandag rond 10:30 Amsterdam is het verzendmoment', () => {
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as {
    crons: { path: string; schedule: string }[];
  };
  const cron = vercel.crons.find((item) => item.path === '/api/cron/nieuwsbrief-verzenden');
  assert.equal(cron?.schedule, '*/5 8-14 * * 1');

  assert.equal(isNieuwsbriefVerzendmoment(new Date('2026-11-30T09:30:00Z')), true);
  assert.equal(isNieuwsbriefVervolgmoment(new Date('2026-11-30T09:30:00Z')), false);
  assert.equal(isNieuwsbriefVerzendmoment(new Date('2026-11-30T09:25:00Z')), false);
  assert.equal(isNieuwsbriefVerzendmoment(new Date('2026-11-30T10:20:00Z')), true);
  assert.equal(isNieuwsbriefVerzendmoment(new Date('2026-11-30T10:25:00Z')), false);
  assert.equal(isNieuwsbriefVervolgmoment(new Date('2026-11-30T10:25:00Z')), true);
  assert.equal(isNieuwsbriefVervolgmoment(new Date('2026-11-30T14:00:00Z')), true);
  assert.equal(isNieuwsbriefVervolgmoment(new Date('2026-11-30T14:05:00Z')), false);

  assert.equal(isNieuwsbriefVerzendmoment(new Date('2026-06-29T08:30:00Z')), true);
  assert.equal(isNieuwsbriefVerzendmoment(new Date('2026-06-29T08:25:00Z')), false);
  assert.equal(isNieuwsbriefVerzendmoment(new Date('2026-06-29T09:20:00Z')), true);
  assert.equal(isNieuwsbriefVerzendmoment(new Date('2026-06-29T09:25:00Z')), false);
  assert.equal(isNieuwsbriefVervolgmoment(new Date('2026-06-29T09:25:00Z')), true);
  assert.equal(isNieuwsbriefVervolgmoment(new Date('2026-06-29T13:00:00Z')), true);
  assert.equal(isNieuwsbriefVervolgmoment(new Date('2026-06-29T13:05:00Z')), false);

  assert.equal(isNieuwsbriefVerzendmoment(new Date('2026-11-25T10:30:00Z')), false);
  assert.equal(isNieuwsbriefVervolgmoment(new Date('2026-11-25T10:30:00Z')), false);
  assert.equal(isNieuwsbriefVerzendmoment(new Date('2026-07-01T09:30:00Z')), false);
  assert.equal(isNieuwsbriefVervolgmoment(new Date('2026-07-01T09:30:00Z')), false);
  assert.equal(isNieuwsbriefVerzendmoment(new Date('2026-11-30T08:30:00Z')), false);
});

test('de lijst toont de eerstvolgende week bovenaan en verstopt verstuurde weken', () => {
  const lijst = nieuwsbrievenOpDatum([
    { id: 'ver', week: '2026-11-16', verstuurd: true },
    { id: 'oud', week: '2026-11-09', verstuurd: false },
    { id: 'later', week: '2026-11-30', verstuurd: false },
    { id: 'nu', week: '2026-11-23', verstuurd: false },
  ], VANDAAG);
  assert.deepEqual(lijst.map((brief) => brief.id), ['nu', 'later', 'oud']);
});

test('het overzicht benoemt of de doorlooptijd al voorbij is', () => {
  assert.equal(conceptStatusLabel({
    week: '2026-11-16',
    verstuurd: false,
    overgeslagen: false,
    aangemaaktOp: VANDAAG,
    vandaag: VANDAAG,
  }), 'Concept, nog binnen de doorlooptijd');
  assert.equal(conceptStatusLabel({
    week: '2026-12-14',
    verstuurd: false,
    overgeslagen: false,
    aangemaaktOp: VANDAAG,
    vandaag: VANDAAG,
  }), 'Concept, klaar om te versturen');
  assert.equal(conceptStatusLabel({
    week: '2026-09-14',
    verstuurd: false,
    overgeslagen: false,
    aangemaaktOp: '2026-11-17',
    vandaag: VANDAAG,
  }), 'Concept');
});

test('klaarzetten opent elke week één keer en laat bestaande tekst staan', async () => {
  const bron = geheugenNieuwsbrief();
  bron.weken.push({
    id: 'al',
    week: '2026-11-16',
    kortNieuws: 'Blijft staan.',
    geannuleerd: false,
    verstuurd: false,
    aangemaaktOp: '2026-10-01',
  });
  const eerste = await vulNieuwsbriefConcepten({
    datum: new Date(`${VANDAAG}T12:00:00Z`),
    bron,
    activiteiten: PROGRAMMA,
  });
  assert.deepEqual(eerste.nieuw, ['2026-11-23', '2026-11-30', '2026-12-07', '2026-12-14']);
  assert.equal(bron.weken.find((week) => week.week === '2026-11-16')?.kortNieuws, 'Blijft staan.');
  assert.match(bron.weken.find((week) => week.week === '2026-12-07')?.kortNieuws ?? '', /Verbeelding in verf/);
  assert.equal(bron.weken.find((week) => week.week === '2026-12-14')?.aangemaaktOp, VANDAAG);

  const tweede = await vulNieuwsbriefConcepten({
    datum: new Date(`${VANDAAG}T12:00:00Z`),
    bron,
    activiteiten: PROGRAMMA,
  });
  assert.deepEqual(tweede.nieuw, []);
  assert.equal(bron.weken.length, 5);
});

test('verzenden slaat een te jong concept over en maakt er geen aan', async () => {
  const bron = geheugenNieuwsbrief();
  await vulNieuwsbriefConcepten({
    datum: new Date(`${VANDAAG}T12:00:00Z`),
    bron,
    activiteiten: PROGRAMMA,
  });
  const register = STANDAARD_AUTOMATISERINGEN.map((item) =>
    item.sleutel === 'nieuwsbrief' ? { ...item, status: 'actief' as const } : item,
  );
  const teVroeg = await verstuurWekelijkseNieuwsbrief({
    register,
    datum: new Date('2026-11-20T08:00:00Z'),
    vrienden: geheugenVrienden([VRIEND]),
    bron,
    transport: { async verstuur() { throw new Error('niet versturen'); } },
  });
  assert.equal(teVroeg.verstuurd, 0);
  assert.equal(teVroeg.overgeslagen, 'doorlooptijd nog niet gehaald');

  const leeg = geheugenNieuwsbrief();
  const ontbreekt = await verstuurWekelijkseNieuwsbrief({
    register,
    datum: new Date('2026-12-18T08:00:00Z'),
    vrienden: geheugenVrienden([VRIEND]),
    bron: leeg,
    transport: { async verstuur() { throw new Error('niet versturen'); } },
  });
  assert.equal(ontbreekt.overgeslagen, 'geen concept');
  assert.equal(leeg.weken.length, 0);

  const open = bron.weken.find((week) => week.week === '2026-12-14');
  assert.ok(open);
  const niet = await verstuurWekelijkseNieuwsbrief({
    register,
    datum: new Date('2026-12-18T08:00:00Z'),
    vrienden: geheugenVrienden([VRIEND]),
    bron,
    transport: { async verstuur() { throw new Error('niet versturen'); } },
  });
  assert.equal(niet.verstuurd, 0);
  assert.equal(niet.overgeslagen, 'nog niet goedgekeurd');
  open.goedgekeurd = true;

  const stil = await verstuurWekelijkseNieuwsbrief({
    register,
    datum: new Date('2026-12-18T08:00:00Z'),
    vrienden: geheugenVrienden([VRIEND]),
    bron,
    transport: { async verstuur() { throw new Error('niet versturen'); } },
  });
  assert.equal(stil.verstuurd, 0);
  assert.equal(stil.overgeslagen, 'geen activiteit deze week');
  assert.equal(bron.weken.find((week) => week.week === '2026-12-14')?.verstuurd, false);

  bron.activiteiten.push({
    _id: 'winter',
    slug: 'winterstop',
    interneTitel: 'Winterstop',
    start: '2026-12-19',
    eind: '2027-02-11',
    soort: 'winterstop',
    zichtbaarheid: 'publiek',
  });
  const rijp = await verstuurWekelijkseNieuwsbrief({
    register,
    datum: new Date('2026-12-18T08:00:00Z'),
    vrienden: geheugenVrienden([VRIEND]),
    bron,
    transport: { async verstuur() {} },
  });
  assert.equal(rijp.verstuurd, 1);
  assert.equal(bron.weken.find((week) => week.week === '2026-12-14')?.verstuurd, true);
});
