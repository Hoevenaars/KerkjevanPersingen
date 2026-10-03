import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { blokkeertBeschikbaarheid, hoortOpPubliekeAgenda, magOpWebsiteZonderTiming, nuZichtbaarOpWebsite } from '../src/lib/agenda-zichtbaarheid.ts';
import { activiteitUitSlugRijen, stelPubliekeAgenda, type AgendaRij } from '../src/lib/publiek-lezen.ts';
import {
  CONCEPT_ZICHTBAARHEID,
  HANDMATIGE_PUBLICATIE_TRIGGER,
  STANDAARD_AFBEELDING,
  afbeeldingVoorWebsite,
  contentCompleet,
  detailVoorWebsite,
  kaartVoorWebsite,
  publicatieBesluit,
  publicatieChecks,
  publicatieDossierHref,
  publicatieUitBoekingen,
  publicatieWerklijst,
  slugBijPublicatie,
  slugNaPublicatie,
  slugUitActiviteit,
  uniekeSlug,
  urlVoorstelZonderContentverlies,
  werkstatus,
  zichtbaarheidNaBewaren,
  type PublicatieBron,
} from '../src/platform/publiceren.ts';

const vandaag = '2026-10-02';

function item(over: Partial<PublicatieBron> & Pick<PublicatieBron, 'id' | 'start' | 'eind' | 'titel'>): PublicatieBron {
  return {
    exposanten: '',
    korteOmschrijving: '',
    volledigeOmschrijving: '',
    fotoPad: '',
    slug: '',
    publicatiestatus: 'bezet',
    ...over,
  };
}

test('activiteit binnen 8 weken staat op de werklijst, daarbuiten niet', () => {
  const lijst = publicatieWerklijst([
    item({ id: 'nu', start: '2026-10-20', eind: '2026-10-21', titel: 'Binnenkort' }),
    item({ id: 'ver', start: '2027-02-01', eind: '2027-02-02', titel: 'Ver weg' }),
    item({ id: 'loopt', start: '2026-09-28', eind: '2026-10-04', titel: 'Loopt' }),
    item({ id: 'later', start: '2026-11-01', eind: '2026-11-02', titel: 'November' }),
  ], vandaag);
  assert.deepEqual(lijst.items.map((rij) => rij.id), ['loopt', 'nu', 'later']);
  assert.equal(lijst.venster.van, '2026-10-02');
  assert.equal(lijst.venster.tot, '2026-11-27');
});

test('volledige content is klaar, ontbrekende korte tekst waarschuwt en force publish mag', () => {
  const klaar = item({
    id: '1',
    start: '2026-10-10',
    eind: '2026-10-11',
    titel: 'Evelien',
    exposanten: 'Evelien Bannenberg',
    korteOmschrijving: 'Kort.',
    volledigeOmschrijving: 'Lang.',
    fotoPad: '/foto/eigen.jpg',
    slug: 'evelien-bannenberg',
  });
  assert.equal(contentCompleet(publicatieChecks(klaar)), true);
  assert.equal(werkstatus(klaar), 'klaar');
  const zonderKort = { ...klaar, korteOmschrijving: '' };
  const checks = publicatieChecks(zonderKort);
  assert.equal(werkstatus(zonderKort, checks), 'mist_content');
  const geweigerd = publicatieBesluit(checks, false);
  assert.equal(geweigerd.mag, false);
  assert.match(geweigerd.melding, /nog niet volledig/);
  assert.equal(geweigerd.mail, false);
  assert.equal(geweigerd.jobs, 0);
  const geforceerd = publicatieBesluit(checks, true);
  assert.equal(geforceerd.mag, true);
  assert.equal(geforceerd.force, true);
  assert.ok(geforceerd.ontbrekend.some((veld) => /korte/i.test(veld)));
  assert.equal(geforceerd.ontbrekend.some((veld) => /afbeelding|url/i.test(veld)), false);
});

test('scenario B en C: standaardafbeelding en ontbrekende URL blokkeren klaar niet', () => {
  const basis = item({
    id: 'foto',
    start: '2026-10-10',
    eind: '2026-10-11',
    titel: 'Evelien',
    exposanten: 'Evelien Bannenberg',
    korteOmschrijving: 'Kort.',
    volledigeOmschrijving: 'Lang.',
    soort: 'expositie',
    praktisch: 'Zaterdag en zondag 11.00-17.00.',
    fotoPad: '',
    slug: 'evelien-bannenberg',
    publicatiestatus: null,
  });
  const zonderFoto = publicatieChecks(basis);
  assert.equal(contentCompleet(zonderFoto), true);
  assert.equal(werkstatus(basis, zonderFoto), 'klaar');
  assert.equal(zonderFoto.find((check) => check.sleutel === 'afbeelding')?.label, 'Standaardafbeelding wordt gebruikt');
  assert.equal(zonderFoto.find((check) => check.sleutel === 'afbeelding')?.rol, 'automatisch');
  const zonderSlug = { ...basis, slug: '' };
  const checks = publicatieChecks(zonderSlug);
  assert.equal(contentCompleet(checks), true);
  assert.equal(werkstatus(zonderSlug, checks), 'klaar');
  assert.equal(slugBijPublicatie({
    exposanten: zonderSlug.exposanten,
    titel: zonderSlug.titel,
    slug: '',
    start: zonderSlug.start,
    bezet: new Set(['evelien-bannenberg']),
  }), 'evelien-bannenberg-2026');
  const zonderPraktisch = { ...basis, praktisch: '' };
  const praktischChecks = publicatieChecks(zonderPraktisch);
  assert.equal(contentCompleet(praktischChecks), false);
  assert.equal(werkstatus(zonderPraktisch, praktischChecks), 'mist_content');
  assert.equal(publicatieBesluit(praktischChecks, true).mag, true);
  const concert = publicatieChecks({ ...zonderPraktisch, soort: 'concert' });
  assert.equal(contentCompleet(concert), true);
});

test('scenario D: URL-voorstel bewaart de ingevoerde tekst', () => {
  const ingevoerd = item({
    id: 'url',
    start: '2026-10-10',
    eind: '2026-10-11',
    titel: 'Nieuwe titel',
    exposanten: 'Nelian Smit',
    korteOmschrijving: 'Net ingetypt.',
    volledigeOmschrijving: 'Ook de lange tekst.',
    praktisch: 'Parkeren aan de overkant.',
    fotoPad: '/foto/nieuw.jpg',
    slug: '',
    publicatiestatus: 'verborgen',
  });
  const voorstel = urlVoorstelZonderContentverlies(ingevoerd, new Set());
  assert.equal(voorstel.item.slug, 'nelian-smit');
  assert.equal(voorstel.item.titel, ingevoerd.titel);
  assert.equal(voorstel.item.korteOmschrijving, ingevoerd.korteOmschrijving);
  assert.equal(voorstel.item.volledigeOmschrijving, ingevoerd.volledigeOmschrijving);
  assert.equal(voorstel.item.praktisch, ingevoerd.praktisch);
  assert.equal(voorstel.item.fotoPad, ingevoerd.fotoPad);
  assert.equal(voorstel.item.publicatiestatus, 'verborgen');
});

test('scenario A en G: opslaan houdt verborgen en blokkeert de kalender niet', () => {
  assert.equal(CONCEPT_ZICHTBAARHEID, 'verborgen');
  assert.equal(zichtbaarheidNaBewaren(null), 'verborgen');
  assert.equal(zichtbaarheidNaBewaren(undefined), 'verborgen');
  assert.equal(zichtbaarheidNaBewaren('verborgen'), 'verborgen');
  assert.equal(zichtbaarheidNaBewaren('publiek'), 'publiek');
  assert.equal(zichtbaarheidNaBewaren('bezet'), 'bezet');
  const verborgen = zichtbaarheidNaBewaren('verborgen');
  assert.equal(blokkeertBeschikbaarheid({ zichtbaarheid: verborgen }), false);
  assert.equal(blokkeertBeschikbaarheid({ zichtbaarheid: zichtbaarheidNaBewaren(null) }), false);
  const opgeslagen = item({
    id: 'verborgen',
    start: '2026-10-10',
    eind: '2026-10-11',
    titel: 'Blijft verborgen',
    korteOmschrijving: 'Aangepaste tekst.',
    publicatiestatus: verborgen,
  });
  assert.equal(werkstatus(opgeslagen), 'verborgen');
  assert.equal(nuZichtbaarOpWebsite({
    zichtbaarheid: opgeslagen.publicatiestatus,
    start: opgeslagen.start,
    eind: opgeslagen.eind,
    trigger: 'direct',
    vandaag,
    viaPubliekeAgenda: true,
  }), false);
});

test('ontbrekende tekst en afbeelding breken de pagina niet', () => {
  const leeg = item({ id: '2', start: '2026-10-10', eind: '2026-10-11', titel: 'Leeg', volledigeOmschrijving: '' });
  assert.equal(detailVoorWebsite(leeg).length > 0, true);
  assert.equal(kaartVoorWebsite(leeg).length > 0, true);
  assert.equal(kaartVoorWebsite({ ...leeg, volledigeOmschrijving: 'Eerste zin. Tweede zin. Derde zin. Vierde zin.' }).includes('Vierde'), false);
  const beeld = afbeeldingVoorWebsite('');
  assert.equal(beeld.eigen, false);
  assert.equal(beeld.src, STANDAARD_AFBEELDING);
  assert.equal(afbeeldingVoorWebsite('/foto/eigen.jpg').eigen, true);
  assert.equal(afbeeldingVoorWebsite('/foto/eigen.jpg').src, '/foto/eigen.jpg');
});

test('slug uit exposanten, uniek en stabiel na publicatie', () => {
  assert.equal(slugUitActiviteit('Evelien Bannenberg', 'Expositie'), 'evelien-bannenberg');
  assert.equal(slugUitActiviteit('Nelian Smit / Winy Smit Vuijk', 'Titel'), 'nelian-smit-winy-smit-vuijk');
  assert.equal(slugUitActiviteit('', 'Éxpositie André'), 'expositie-andre');
  assert.equal(slugUitActiviteit('', 'A--B'), 'a-b');
  const bezet = new Set(['isabelle-hartman']);
  assert.equal(uniekeSlug('isabelle-hartman', bezet, '2028'), 'isabelle-hartman-2028');
  bezet.add('isabelle-hartman-2028');
  assert.equal(uniekeSlug('isabelle-hartman', bezet, '2028'), 'isabelle-hartman-2028-2');
  const gepubliceerd = item({
    id: '3',
    start: '2026-10-10',
    eind: '2026-10-11',
    titel: 'Isabelle',
    slug: 'isabelle-hartman',
    publicatiestatus: 'publiek',
  });
  const vast = slugNaPublicatie(gepubliceerd, 'isabelle-hartman-nieuw', false);
  assert.equal(vast.slug, 'isabelle-hartman');
  assert.match(vast.waarschuwing, /bewust/);
  assert.equal(slugNaPublicatie(gepubliceerd, 'isabelle-hartman-nieuw', true).slug, 'isabelle-hartman-nieuw');
});

test('publicatie toont de activiteit, verbergen haalt haar weg, zonder mail', () => {
  const basis = {
    gepubliceerd: true,
    inhoudStatus: 'niet_gestart' as const,
    eind: '2026-10-11',
    trigger: 'zodra_content_compleet',
    contentstatus: 'niet_aangeleverd',
    soort: 'expositie',
    titel: 'Evelien Bannenberg',
    korteOmschrijving: null,
    volledigeOmschrijving: null,
    hoofdafbeelding: null,
  };
  assert.equal(hoortOpPubliekeAgenda({ ...basis, zichtbaarheid: 'publiek' }, vandaag), true);
  assert.equal(hoortOpPubliekeAgenda({ ...basis, zichtbaarheid: 'verborgen' }, vandaag), false);
  assert.equal(magOpWebsiteZonderTiming({ zichtbaarheid: 'publiek', contentstatus: 'niet_aangeleverd' }), true);
  const besluit = publicatieBesluit(publicatieChecks(item({
    id: '4', start: '2026-10-10', eind: '2026-10-11', titel: 'Evelien',
  })), true);
  assert.equal(besluit.workflow, false);
  assert.equal(besluit.mail, false);
  assert.equal(besluit.jobs, 0);
});

test('verhuur in de komende 8 weken staat op de werklijst', () => {
  const activiteiten = [
    item({ id: 'evelien', start: '2026-11-07', eind: '2026-11-08', titel: 'expositie Evelien Bannenberg' }),
  ];
  const verhuur = publicatieUitBoekingen([
    { id: '42', start: '2026-10-10', eind: '2026-10-11', titel: 'Oktober 10/11', huurder: 'Martina Vieten', status: 'migratie_vastgelegd' },
    { id: '39', start: '2026-10-03', eind: '2026-10-04', titel: 'Oktober 3/4 geannuleerd', huurder: 'Jos van Riswick', status: 'geannuleerd' },
    { id: '257', start: '2026-11-07', eind: '2026-11-08', titel: 'November 7/8.', huurder: 'Evelien Bannenberg', status: 'migratie_vastgelegd' },
    { id: '51', start: '2026-11-28', eind: '2026-11-29', titel: 'November 28/29', huurder: 'Nick Cillessen', status: 'migratie_vastgelegd' },
  ], activiteiten);
  const lijst = publicatieWerklijst([...activiteiten, ...verhuur], vandaag);
  assert.deepEqual(lijst.items.map((rij) => rij.id), ['42', 'evelien']);
  assert.equal(lijst.items[0]?.exposanten, 'Martina Vieten');
  assert.equal(lijst.items[0]?.tabel, 'boekingen');
  assert.equal(publicatieDossierHref(lijst.items[0]!), '/beheer/boekingen/42/');
  assert.equal(werkstatus(lijst.items[0]!), 'mist_content');
});

test('publieke agenda volgt publicatiestatus en koppelt Second Nature', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261002210000_agenda_zonder_contentblokkade.sql', import.meta.url), 'utf8');
  assert.equal(sql.includes("p.contentstatus = 'goedgekeurd'"), false);
  assert.match(sql, /second-nature/);
  assert.match(sql, /Monika Loster/);
  assert.match(sql, /boeking_id = b.id/);
});

test('scenario E en F: toch publiceren is direct zichtbaar, agenda en detail volgen dezelfde poort', () => {
  const kaal = item({
    id: 'kaal',
    start: '2026-10-10',
    eind: '2026-10-11',
    titel: 'Zonder tekst',
    publicatiestatus: 'publiek',
    trigger: HANDMATIGE_PUBLICATIE_TRIGGER,
    tabel: 'publieke_activiteiten',
  });
  const checks = publicatieChecks(kaal);
  assert.equal(contentCompleet(checks), false);
  const besluit = publicatieBesluit(checks, true);
  assert.equal(besluit.mag, true);
  assert.equal(besluit.force, true);
  assert.equal(besluit.mail, false);
  assert.equal(besluit.workflow, false);
  assert.equal(besluit.jobs, 0);
  assert.equal(kaartVoorWebsite(kaal), 'Binnenkort meer informatie over deze activiteit.');
  assert.equal(detailVoorWebsite(kaal), 'Meer informatie volgt.');
  assert.equal(afbeeldingVoorWebsite(kaal.fotoPad).src, STANDAARD_AFBEELDING);
  assert.equal(nuZichtbaarOpWebsite({
    zichtbaarheid: 'publiek',
    geannuleerd: false,
    start: kaal.start,
    eind: kaal.eind,
    trigger: HANDMATIGE_PUBLICATIE_TRIGGER,
    vandaag,
    viaPubliekeAgenda: true,
    nu: new Date('2026-10-02T12:00:00Z'),
  }), true);
  assert.equal(nuZichtbaarOpWebsite({
    zichtbaarheid: 'publiek',
    start: kaal.start,
    eind: kaal.eind,
    trigger: 'niet_publiceren',
    vandaag,
    viaPubliekeAgenda: true,
  }), false);
  assert.equal(nuZichtbaarOpWebsite({
    zichtbaarheid: 'publiek',
    start: '2028-06-01',
    eind: '2028-06-02',
    trigger: 'uiterlijk_12_maanden',
    vandaag,
    viaPubliekeAgenda: true,
    nu: new Date('2026-10-02T12:00:00Z'),
  }), false);
  const rij: AgendaRij = {
    id: 9,
    slug: 'zonder-tekst',
    titel: 'Zonder tekst',
    start_datum: '2026-10-10',
    eind_datum: '2026-10-11',
    omschrijving: null,
    foto_pad: null,
    foto_alt: null,
    publicatie_trigger: HANDMATIGE_PUBLICATIE_TRIGGER,
    zichtbaarheid: 'publiek',
    inhoud_status: 'niet_gestart',
    soort: 'expositie',
    contentstatus: 'niet_aangeleverd',
    korte_omschrijving: null,
    volledige_omschrijving: null,
  };
  assert.equal(stelPubliekeAgenda([rij], new Date('2026-10-02T12:00:00Z')).length, 1);
  assert.equal(activiteitUitSlugRijen('zonder-tekst', [rij], new Date('2026-10-02T12:00:00Z'))?.slug, 'zonder-tekst');
  assert.equal(activiteitUitSlugRijen('zonder-tekst', [{ ...rij, zichtbaarheid: 'verborgen' }], new Date('2026-10-02T12:00:00Z')), null);
});

test('publiceren toont geen technische bronvelden en blokkeert mail in sql', () => {
  const pagina = readFileSync(new URL('../src/pages/beheer/publiceren/index.astro', import.meta.url), 'utf8');
  const sql = readFileSync(new URL('../supabase/migrations/20261003190100_publiceren_concept_en_direct.sql', import.meta.url), 'utf8');
  const bezetting = readFileSync(new URL('../supabase/migrations/20261001180000_activiteit_beheer.sql', import.meta.url), 'utf8');
  const bezettingFunctie = bezetting.slice(
    bezetting.indexOf('function public.publieke_bezetting'),
    bezetting.indexOf('revoke all on function public.publieke_bezetting'),
  );
  assert.match(pagina, /Te publiceren komende 8 weken/);
  assert.match(pagina, /Toch publiceren/);
  assert.match(pagina, /publicatieBesluit\(checks, actie === 'toch_publiceren'\)/);
  assert.equal(pagina.includes('name="bevestig"'), false);
  assert.match(pagina, /Genereer URL/);
  assert.match(pagina, /data-genereer-url/);
  assert.match(pagina, /type="button"/);
  assert.equal(pagina.includes("searchParams.set('voorstel'"), false);
  assert.match(pagina, /urlVoorstelZonderContentverlies/);
  assert.match(pagina, /Nu zichtbaar op website/);
  assert.match(pagina, /nuZichtbaarOpWebsite/);
  assert.match(pagina, /Standaardafbeelding wordt gebruikt/);
  assert.equal(pagina.includes('legacy_id'), false);
  assert.equal(pagina.includes('activiteit_bron'), false);
  assert.match(pagina, /Open de boeking/);
  assert.match(sql, /boekingen/);
  assert.match(sql, /boeking_id/);
  assert.match(sql, /force_publish/);
  assert.match(sql, /publiceren mag geen communicatiejob maken/);
  assert.match(sql, /'direct'::public\.publicatie_trigger/);
  assert.match(sql, /unieke_publicatie_slug/);
  assert.match(sql, /else 'verborgen'/);
  assert.equal(sql.includes("else 'bezet'"), false);
  assert.equal(sql.includes('insert into public.communicatie_jobs'), false);
  assert.equal(sql.includes('insert into public.workflow'), false);
  assert.equal(/update\s+public\.boekingen/i.test(sql), false);
  assert.equal(sql.includes("p.contentstatus = 'goedgekeurd'"), false);
  assert.equal(bezettingFunctie.includes('publieke_activiteiten'), false);
  assert.match(sql, /publicatie_trigger = 'direct'::public\.publicatie_trigger/);
  assert.match(sql, /then publicatie_trigger/);
  const sessie = readFileSync(new URL('../supabase/migrations/20261003190200_publicatie_sessie_en_foto.sql', import.meta.url), 'utf8');
  assert.match(sessie, /security definer/);
  assert.match(sessie, /app\.heeft_recht\('agenda', 'schrijven'\)/);
  assert.match(sessie, /grant execute on function public\.beheer_publicatie/);
  assert.match(sessie, /to authenticated, service_role/);
  assert.match(sessie, /from public, anon/);
  assert.match(sessie, /public-media/);
  assert.match(sessie, /public_media_toevoegen/);
  assert.match(pagina, /enctype="multipart\/form-data"/);
  assert.match(pagina, /type="file"/);
  assert.match(pagina, /uploadPublicatieFoto/);
  assert.match(pagina, /sessieSupabaseUitAstro/);
});

test('publicatiefoto accepteert alleen een bruikbaar beeldbestand en maakt een publieke url', async () => {
  const {
    publicatieFotoGeldig,
    publicatieFotoPad,
    publiekeMediaUrl,
    leesbarePublicatieFout,
  } = await import('../src/lib/publicatie-foto.ts');
  assert.equal(publicatieFotoGeldig({ type: 'image/png', name: 'martina.png', size: 12 }).ok, true);
  assert.match(publicatieFotoGeldig({ type: 'text/plain', name: 'lees.txt', size: 12 }).melding ?? '', /JPEG/);
  assert.match(publicatieFotoGeldig({ type: 'image/jpeg', name: 'groot.jpg', size: 11 * 1024 * 1024 }).melding ?? '', /10 MB/);
  assert.equal(publicatieFotoPad('42', 'Martina Vieten.JPG', 1000), 'publicaties/42-1000.jpg');
  assert.equal(
    publiekeMediaUrl('publicaties/42-1000.jpg'),
    'https://xskqpefeumylrticrphp.supabase.co/storage/v1/object/public/public-media/publicaties/42-1000.jpg',
  );
  assert.match(leesbarePublicatieFout('Invalid API key'), /weigert de beheersleutel/);
  assert.match(leesbarePublicatieFout('permission denied for function beheer_publicatie'), /Geen recht/);
  const { toonFotoInHetGeheel } = await import('../src/lib/publicatie-foto.ts');
  assert.equal(toonFotoInHetGeheel(publiekeMediaUrl('publicaties/42-1000.webp')), true);
  assert.equal(toonFotoInHetGeheel('/foto/kerkje-standaard.svg'), false);
  const detail = readFileSync(new URL('../src/pages/agenda/[slug].astro', import.meta.url), 'utf8');
  const lijst = readFileSync(new URL('../src/pages/agenda/index.astro', import.meta.url), 'utf8');
  assert.match(detail, /frame--heel/);
  assert.match(lijst, /frame--heel/);
  assert.match(readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8'), /object-fit: contain/);
});
