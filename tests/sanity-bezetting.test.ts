import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { activiteitenVoorKalender, kiesGepubliceerdeActiviteit, mergeKalenderBronnen } from '../src/lib/sanity-documenten.ts';
import { bezetteKalenderDagen } from '../src/lib/datum.ts';
import { eerstvolgendeVrijeWeekenden } from '../src/lib/week.ts';
import { SECOND_NATURE } from '../src/lib/second-nature.ts';

describe('kiesGepubliceerdeActiviteit', () => {
  test('ongepubliceerde datumwijziging wint niet van de gepubliceerde boeking', () => {
    const docs = [
      {
        _id: 'abc',
        start: '2026-10-09T09:00:00.000Z',
        zichtbaarheid: 'verborgen' as const,
      },
      {
        _id: 'drafts.abc',
        start: '2026-11-07T09:00:00.000Z',
        eind: '2026-11-08T16:00:00.000Z',
        zichtbaarheid: 'bezet' as const,
      },
    ];
    const gekozen = kiesGepubliceerdeActiviteit(docs);
    assert.equal(gekozen.length, 1);
    assert.equal(gekozen[0]._id, 'abc');
    assert.equal(gekozen[0].zichtbaarheid, 'verborgen');
  });

  test('een concept zonder gepubliceerde versie blijft staan', () => {
    const docs = [{ _id: 'drafts.nieuw', start: '2026-09-12T09:00:00.000Z', zichtbaarheid: 'publiek' as const }];
    const gekozen = kiesGepubliceerdeActiviteit(docs);
    assert.equal(gekozen[0]._id, 'drafts.nieuw');
  });
});

describe('agenda vs kalender — Second Nature en 7-8 november', () => {
  test('Second Nature blokkeert 3-4 oktober, 7-8 november blijft kiesbaar', () => {
    const september = [
      { start: '2026-09-12T09:00:00.000Z', eind: '2026-09-13T16:00:00.000Z', soort: 'expositie', zichtbaarheid: 'publiek' },
      { start: '2026-09-19T09:00:00.000Z', eind: '2026-09-20T16:00:00.000Z', soort: 'expositie', zichtbaarheid: 'publiek' },
      { start: '2026-09-26T09:00:00.000Z', eind: '2026-09-27T16:00:00.000Z', soort: 'expositie', zichtbaarheid: 'publiek' },
    ];
    const dagen = bezetteKalenderDagen([...september, SECOND_NATURE]);
    assert.equal(dagen.has('2026-10-03'), true);
    assert.equal(dagen.has('2026-10-04'), true);
    assert.equal(dagen.has('2026-11-07'), false);
    assert.equal(dagen.has('2026-11-08'), false);

    const weekenden = eerstvolgendeVrijeWeekenden(dagen, 3, new Date('2026-09-10T12:00:00Z'));
    assert.equal(weekenden[0].zaterdag, '2026-10-10');

    const oktoberVerderBezet = new Set(dagen);
    for (const dag of ['2026-10-10', '2026-10-11', '2026-10-17', '2026-10-18', '2026-10-24', '2026-10-25', '2026-10-31', '2026-11-01']) {
      oktoberVerderBezet.add(dag);
    }
    const naOktober = eerstvolgendeVrijeWeekenden(oktoberVerderBezet, 1, new Date('2026-09-10T12:00:00Z'));
    assert.equal(naOktober[0].zaterdag, '2026-11-07');
    assert.equal(naOktober[0].zondag, '2026-11-08');
  });

  test('concept-overlay van een verborgen boeking blokkeert 7-8 november niet', () => {
    const ruw = [
      {
        _id: 'jona',
        start: '2026-10-09T09:00:00.000Z',
        eind: '2026-10-09T16:00:00.000Z',
        zichtbaarheid: 'verborgen' as const,
      },
      {
        _id: 'drafts.jona',
        start: '2026-11-07T09:00:00.000Z',
        eind: '2026-11-08T16:00:00.000Z',
        zichtbaarheid: 'bezet' as const,
      },
      SECOND_NATURE,
    ];
    const dagen = bezetteKalenderDagen(activiteitenVoorKalender(ruw));
    assert.equal(dagen.has('2026-10-03'), true);
    assert.equal(dagen.has('2026-11-07'), false);
    assert.equal(dagen.has('2026-11-08'), false);
  });

  test('een ongepubliceerd "alleen bezet"-concept blokkeert 7-8 november niet', () => {
    const ruw = [
      {
        _id: 'drafts.leeg-weekend',
        start: '2026-11-07T09:00:00.000Z',
        eind: '2026-11-08T16:00:00.000Z',
        zichtbaarheid: 'bezet' as const,
      },
      SECOND_NATURE,
    ];
    const dagen = bezetteKalenderDagen(activiteitenVoorKalender(ruw));
    assert.equal(dagen.has('2026-11-07'), false);
    assert.equal(dagen.has('2026-11-08'), false);
    const weekenden = eerstvolgendeVrijeWeekenden(dagen, 1, new Date('2026-11-05T12:00:00Z'));
    assert.equal(weekenden[0].zaterdag, '2026-11-07');
    assert.equal(weekenden[0].zondag, '2026-11-08');
  });

  test('een gepubliceerde "alleen bezet"-boeking blijft de kalender blokkeren', () => {
    const dagen = bezetteKalenderDagen(
      activiteitenVoorKalender([
        {
          _id: 'echt',
          start: '2026-11-07T09:00:00.000Z',
          eind: '2026-11-08T16:00:00.000Z',
          zichtbaarheid: 'bezet' as const,
        },
      ]),
    );
    assert.equal(dagen.has('2026-11-07'), true);
    assert.equal(dagen.has('2026-11-08'), true);
  });

  test('een ongepubliceerde publieke expositie blijft de kalender blokkeren', () => {
    const dagen = bezetteKalenderDagen(
      activiteitenVoorKalender([
        {
          _id: 'drafts.september',
          start: '2026-09-12T09:00:00.000Z',
          eind: '2026-09-13T16:00:00.000Z',
          soort: 'expositie',
          zichtbaarheid: 'publiek' as const,
        },
      ]),
    );
    assert.equal(dagen.has('2026-09-12'), true);
    assert.equal(dagen.has('2026-09-13'), true);
  });

  test('een Content Release-versie (versions.) blokkeert 7-8 november niet', () => {
    const dagen = bezetteKalenderDagen(
      activiteitenVoorKalender([
        {
          _id: 'versions.weekend-planning.leeg-weekend',
          start: '2026-11-07T09:00:00.000Z',
          eind: '2026-11-08T16:00:00.000Z',
          zichtbaarheid: 'bezet' as const,
        },
        SECOND_NATURE,
      ]),
    );
    assert.equal(dagen.has('2026-11-07'), false);
    assert.equal(dagen.has('2026-11-08'), false);
  });

  test('previewDrafts-overlay van een verborgen boeking houdt de gepubliceerde datum', () => {
    const ruw = [
      {
        _id: 'jona',
        start: '2026-10-09T09:00:00.000Z',
        eind: '2026-10-09T16:00:00.000Z',
        zichtbaarheid: 'verborgen' as const,
      },
      {
        _id: 'jona',
        _originalId: 'drafts.jona',
        start: '2026-11-07T09:00:00.000Z',
        eind: '2026-11-08T16:00:00.000Z',
        zichtbaarheid: 'bezet' as const,
      },
    ];
    const gekozen = kiesGepubliceerdeActiviteit(ruw);
    assert.equal(gekozen.length, 1);
    assert.equal(gekozen[0].zichtbaarheid, 'verborgen');
    const dagen = bezetteKalenderDagen(activiteitenVoorKalender(ruw));
    assert.equal(dagen.has('2026-11-07'), false);
  });

  test('previewDrafts zonder drafts.-prefix blokkeert 7-8 november niet', () => {
    const dagen = bezetteKalenderDagen(
      activiteitenVoorKalender([
        {
          _id: 'leeg-weekend',
          _originalId: 'drafts.leeg-weekend',
          start: '2026-11-07T09:00:00.000Z',
          eind: '2026-11-08T16:00:00.000Z',
          zichtbaarheid: 'bezet' as const,
        },
        SECOND_NATURE,
      ]),
    );
    assert.equal(dagen.has('2026-11-07'), false);
    assert.equal(dagen.has('2026-11-08'), false);
  });

  test('kalender volgt gepubliceerde data plus agenda, niet een verborgen concept', () => {
    const gepubliceerd = activiteitenVoorKalender([
      {
        _id: 'roos',
        start: '2027-06-25T08:00:00.000Z',
        eind: '2027-06-25T20:00:00.000Z',
        zichtbaarheid: 'bezet' as const,
      },
    ]);
    const agenda = [SECOND_NATURE];
    const dagen = bezetteKalenderDagen(mergeKalenderBronnen(gepubliceerd, agenda));
    assert.equal(dagen.has('2026-10-03'), true);
    assert.equal(dagen.has('2026-11-07'), false);
    assert.equal(dagen.has('2026-11-08'), false);
    const weekenden = eerstvolgendeVrijeWeekenden(dagen, 1, new Date('2026-11-05T12:00:00Z'));
    assert.equal(weekenden[0].zaterdag, '2026-11-07');
  });

  test('gepubliceerde productiedata plus agenda laten 7-8 november vrij', () => {
    const gepubliceerd = activiteitenVoorKalender([
      {
        _id: 'jona-sept',
        start: '2026-09-10T09:00:00.000Z',
        eind: '2026-09-10T16:00:00.000Z',
        zichtbaarheid: 'verborgen' as const,
      },
      {
        _id: 'jona-okt',
        start: '2026-10-09T09:00:00.000Z',
        eind: '2026-10-09T16:00:00.000Z',
        zichtbaarheid: 'verborgen' as const,
      },
      {
        _id: 'roos',
        start: '2027-06-25T08:00:00.000Z',
        eind: '2027-06-25T20:00:00.000Z',
        zichtbaarheid: 'bezet' as const,
      },
    ]);
    const agenda = [
      {
        _id: 'drafts.september',
        slug: 'september-12',
        start: '2026-09-12T09:00:00.000Z',
        eind: '2026-09-13T16:00:00.000Z',
        soort: 'expositie',
        zichtbaarheid: 'publiek' as const,
      },
      SECOND_NATURE,
    ];
    const dagen = bezetteKalenderDagen(mergeKalenderBronnen(gepubliceerd, agenda));
    assert.equal(dagen.has('2026-09-12'), true);
    assert.equal(dagen.has('2026-10-03'), true);
    assert.equal(dagen.has('2026-10-09'), false);
    assert.equal(dagen.has('2026-11-07'), false);
    assert.equal(dagen.has('2026-11-08'), false);
    const weekenden = eerstvolgendeVrijeWeekenden(dagen, 1, new Date('2026-11-05T12:00:00Z'));
    assert.equal(weekenden[0].zaterdag, '2026-11-07');
    assert.equal(weekenden[0].zondag, '2026-11-08');
  });
});
