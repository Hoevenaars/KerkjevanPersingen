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
