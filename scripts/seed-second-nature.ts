/**
 * Voegt de expositie Second Nature toe aan Sanity (of werkt een bestaande boeking bij).
 *
 * Gebruik:
 *   SANITY_PROJECT_ID=8le5jso9 SANITY_DATASET=production SANITY_API_TOKEN=… \
 *     npx tsx scripts/seed-second-nature.ts
 */
import { createClient } from '@sanity/client';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectId = process.env.SANITY_PROJECT_ID ?? '8le5jso9';
const dataset = process.env.SANITY_DATASET ?? 'production';
const token = process.env.SANITY_API_TOKEN;

if (!token) {
  console.error('SANITY_API_TOKEN ontbreekt — schrijftoegang is nodig.');
  process.exit(1);
}

const client = createClient({
  projectId,
  dataset,
  apiVersion: '2024-10-01',
  token,
  useCdn: false,
});

const KUNSTENAARS = 'Judith Aardse, Gea van Eck, Monika Loster, Judith Schepers';

const OMSCHRIJVING =
  'In de tentoonstelling Second Nature onderzoeken Judith Aardse, Gea van Eck, Monika Loster en Judith Schepers de grens tussen natuur en menselijk ingrijpen.';

const AANGELEVERDE_TEKST = `In de tentoonstelling Second Nature onderzoeken Judith Aardse, Gea van Eck, Monika Loster en Judith Schepers de grens tussen natuur en menselijk ingrijpen.

Met tekeningen, textielkunst, sculptuur en fotografie brengen de kunstenaars ieder vanuit hun eigen praktijk een andere benadering van het thema samen. Organische vormen, lichamelijkheid, groei, landschap, structuur en transformatie keren op verschillende manieren terug in de werken.

Second Nature gaat niet alleen over natuur als onderwerp, maar ook over de manier waarop wij haar ervaren, nabootsen, veranderen en opnieuw vormgeven. De tentoonstelling nodigt daarmee uit om opnieuw te kijken naar wat wij als natuurlijk beschouwen en naar onze eigen rol daarin.`;

const POSTER = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../public/foto/exposities/second-nature.jpg',
);

async function uploadPoster() {
  const buffer = readFileSync(POSTER);
  return client.assets.upload('image', buffer, {
    filename: 'second-nature.jpg',
    contentType: 'image/jpeg',
  });
}

async function main() {
  const bestaand = await client.fetch<{ _id: string } | null>(
    `*[_type == "activiteit" && slug.current == "second-nature"][0]{ _id }`,
  );

  const asset = await uploadPoster();

  const velden = {
    interneTitel: 'Expositie: Second Nature',
    publiekeTitel: 'Second Nature',
    slug: { _type: 'slug', current: 'second-nature' },
    start: '2026-10-03T09:00:00.000Z',
    eind: '2026-10-04T16:00:00.000Z',
    soort: 'expositie',
    zichtbaarheid: 'publiek',
    kunstenaars: KUNSTENAARS,
    omschrijving: OMSCHRIJVING,
    contentStatus: 'goedgekeurd',
    aangeleverdeTekst: AANGELEVERDE_TEKST,
    aangeleverdeFoto: {
      _type: 'image',
      asset: { _type: 'reference', _ref: asset._id },
    },
    foto: {
      _type: 'image',
      asset: { _type: 'reference', _ref: asset._id },
    },
    fotoAlt: 'Expositieposter Second Nature met werk van vier kunstenaars',
    toestemmingBeeld: true,
    boekingStatus: 'definitief',
    aanbetalingBinnen: true,
  };

  if (bestaand) {
    await client.patch(bestaand._id).set(velden).commit();
    console.log(`Second Nature bijgewerkt (${bestaand._id}).`);
  } else {
    const doc = await client.create({ _type: 'activiteit', ...velden });
    console.log(`Second Nature aangemaakt (${doc._id}).`);
  }

  console.log('Klaar — bekijk /agenda/second-nature/ op de site.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
