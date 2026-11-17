import assert from 'node:assert/strict';
import test from 'node:test';
import { postAlsSupabase } from '../src/lib/operatie/runtime.ts';

test('afwijzen antwoordt 303 met headers die Astro nog mag zetten', async () => {
  const formulier = new FormData();
  formulier.set('actie', 'weiger');
  formulier.set('reden', 'Past niet in het kerkje');
  const keten = () => {
    const query = {
      select: () => query,
      update: () => query,
      insert: () => query,
      eq: () => query,
      maybeSingle: () => Promise.resolve({ data: { id: 21, status: 'nieuw' }, error: null }),
      then: (resolve: (waarde: { data: null; error: null; count: number }) => unknown) =>
        Promise.resolve({ data: null, error: null, count: 0 }).then(resolve),
    };
    return query;
  };
  const antwoord = await postAlsSupabase({
    request: new Request('https://kerkjepersingen.nl/beheer/aanvragen/21/', { method: 'POST' }),
    url: new URL('https://kerkjepersingen.nl/beheer/aanvragen/21/'),
    env: {},
    actor: { type: 'gebruiker', naam: 'Nick', rechten: { isSuperAdmin: true, perModule: {} } },
    sessie: { from: () => keten() },
    formulier,
  });
  assert.ok(antwoord);
  antwoord.headers.set('X-Astro-Route-Type', 'page');
  assert.equal(antwoord.status, 303);
  assert.equal(antwoord.headers.get('X-Astro-Route-Type'), 'page');
  assert.equal(
    antwoord.headers.get('Location'),
    'https://kerkjepersingen.nl/beheer/aanvragen/21/?melding=Aanvraag+afgewezen.+Er+is+geen+mail+verstuurd.',
  );
});

test('geschikt antwoordt 303 naar hetzelfde dossier', async () => {
  const formulier = new FormData();
  formulier.set('actie', 'geschikt');
  const keten = () => {
    const query = {
      select: () => query,
      update: () => query,
      insert: () => query,
      eq: () => query,
      maybeSingle: () => Promise.resolve({ data: { id: 21, status: 'nieuw' }, error: null }),
      then: (resolve: (waarde: { data: null; error: null; count: number }) => unknown) =>
        Promise.resolve({ data: null, error: null, count: 0 }).then(resolve),
    };
    return query;
  };
  const antwoord = await postAlsSupabase({
    request: new Request('https://kerkjepersingen.nl/beheer/aanvragen/21/', { method: 'POST' }),
    url: new URL('https://kerkjepersingen.nl/beheer/aanvragen/21/'),
    env: {},
    actor: { type: 'gebruiker', naam: 'Nick', rechten: { isSuperAdmin: true, perModule: {} } },
    sessie: { from: () => keten() },
    formulier,
  });
  assert.ok(antwoord);
  assert.equal(antwoord.status, 303);
  const locatie = antwoord.headers.get('Location') ?? '';
  assert.match(locatie, /^https:\/\/kerkjepersingen\.nl\/beheer\/aanvragen\/21\/\?melding=/);
  assert.match(decodeURIComponent(locatie), /geschikt/);
});

test('opslaan houdt jaar, zoektekst en begeleiderfilter vast', async () => {
  const formulier = new FormData();
  formulier.set('actie', 'bewaar');
  formulier.set('boekingId', '67');
  formulier.set('gastheerId', '4');
  const antwoord = await postAlsSupabase({
    request: new Request('https://kerkjepersingen.nl/beheer/planning/?jaar=2027&maand=alle&q=Mirjam&begeleider=nee', { method: 'POST' }),
    url: new URL('https://kerkjepersingen.nl/beheer/planning/?jaar=2027&maand=alle&q=Mirjam&begeleider=nee'),
    env: {},
    actor: { type: 'gebruiker', naam: 'Nick', rechten: { isSuperAdmin: true, perModule: {} } },
    sessie: { from: () => ({}) },
    formulier,
  });
  assert.ok(antwoord);
  const locatie = new URL(antwoord.headers.get('Location') ?? '');
  assert.equal(locatie.pathname, '/beheer/planning/');
  assert.equal(locatie.searchParams.get('jaar'), '2027');
  assert.equal(locatie.searchParams.get('maand'), 'alle');
  assert.equal(locatie.searchParams.get('q'), 'Mirjam');
  assert.equal(locatie.searchParams.get('begeleider'), 'nee');
});

test('bewaar van de lijst slaat meerdere begeleiders op en houdt de maand vast', async () => {
  const formulier = new FormData();
  formulier.set('actie', 'bewaar');
  formulier.set('begeleider:10', '4');
  formulier.set('begeleider:11', '4');
  const gastheer = new Map<number, number | null>([[10, null], [11, 4]]);
  const updates: number[] = [];
  const keten = (tabel: string) => {
    let id = 0;
    let schrijven: Record<string, unknown> | null = null;
    const query = {
      select: () => query,
      update: (waarden: Record<string, unknown>) => {
        schrijven = waarden;
        return query;
      },
      insert: () => Promise.resolve({ error: null }),
      eq: (_kolom: string, waarde: unknown) => {
        id = Number(waarde);
        return query;
      },
      maybeSingle: () => {
        if (tabel === 'relaties') return Promise.resolve({ data: { id, naam: 'Hans' }, error: null });
        if (schrijven && tabel === 'boekingen') {
          updates.push(id);
          gastheer.set(id, (schrijven.gastheer_relatie_id as number | null) ?? null);
        }
        if (tabel === 'boekingen' && !gastheer.has(id)) return Promise.resolve({ data: null, error: null });
        return Promise.resolve({ data: { id, gastheer_relatie_id: gastheer.get(id) ?? null }, error: null });
      },
      then: (resolve: (waarde: { data: { id: number }; error: null }) => unknown) =>
        Promise.resolve({ data: { id }, error: null }).then(resolve),
    };
    return query;
  };
  const antwoord = await postAlsSupabase({
    request: new Request('https://kerkjepersingen.nl/beheer/planning/?jaar=2027&maand=1', { method: 'POST' }),
    url: new URL('https://kerkjepersingen.nl/beheer/planning/?jaar=2027&maand=1'),
    env: {},
    actor: { type: 'gebruiker', naam: 'Nick', rechten: { isSuperAdmin: true, perModule: {} } },
    sessie: { from: keten },
    formulier,
  });
  assert.ok(antwoord);
  const locatie = new URL(antwoord.headers.get('Location') ?? '');
  assert.equal(locatie.searchParams.get('jaar'), '2027');
  assert.equal(locatie.searchParams.get('maand'), '1');
  assert.equal(locatie.searchParams.get('melding'), '1 expositiebegeleider opgeslagen.');
  assert.deepEqual(updates, [10]);
  assert.equal(gastheer.get(11), 4);
});
