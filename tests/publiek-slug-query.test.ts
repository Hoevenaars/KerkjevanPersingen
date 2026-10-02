import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

test('activiteitdetail vraagt alleen publieke_activiteit_op_slug', async () => {
  const hits: { url: string; body: string }[] = [];
  const rij = {
    id: 120,
    slug: 'activiteit-120',
    titel: 'Activiteit 120',
    start_datum: '2027-06-01',
    eind_datum: '2027-06-02',
    omschrijving: 'Voorbij de lijst.',
    korte_omschrijving: null,
    volledige_omschrijving: null,
    foto_pad: null,
    foto_alt: null,
    aanvullende_afbeeldingen: [],
    exposanten: null,
    praktische_informatie: null,
    publicatie_trigger: null,
    zichtbaarheid: 'publiek',
    inhoud_status: 'niet_gestart',
    contentstatus: null,
    soort: 'expositie',
    levenscyclus: 'actief',
  };
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const url = req.url ?? '';
      const body = Buffer.concat(chunks).toString();
      hits.push({ url, body });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(url.includes('publieke_activiteit_op_slug') ? JSON.stringify([rij]) : '[]');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const adres = server.address();
  const port = typeof adres === 'object' && adres ? adres.port : 0;
  const vorigeUrl = process.env.SUPABASE_URL;
  const vorigeSleutel = process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_audit';
  try {
    const { getActiviteitBySlug } = await import('../src/lib/sanity.ts');
    const activiteit = await getActiviteitBySlug('activiteit-120');
    assert.equal(activiteit?.slug, 'activiteit-120');
    assert.equal(activiteit?.publiekeTitel, 'Activiteit 120');
    assert.equal(hits.length, 1);
    assert.match(hits[0].url, /\/rest\/v1\/rpc\/publieke_activiteit_op_slug$/);
    assert.match(hits[0].body, /activiteit-120/);
    assert.equal(hits.some((hit) => hit.url.includes('publieke_agenda')), false);
  } finally {
    server.close();
    if (vorigeUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = vorigeUrl;
    if (vorigeSleutel === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = vorigeSleutel;
  }
});
