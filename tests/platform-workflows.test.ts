import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { kiesTarief, tariefSnapshot, aanbetalingOverride, INITIELE_TARIEVEN } from '../src/platform/finance.ts';
import { beoordeelPublicatie } from '../src/platform/publicatie.ts';
import {
  magAutomatischVerzenden,
  isNieuweOntvanger,
  emailWijzigingIsNieuweOntvanger,
  actieVoorNieuweOntvanger,
  herplanNaDatumwijziging,
  bijAnnulering,
} from '../src/platform/communicatie.ts';
import { aanmeldActie } from '../src/platform/vrienden.ts';
import { naTestVerzending, isEchteVerzending, overslaan } from '../src/platform/nieuwsbrief.ts';
import { dashboardVoor } from '../src/platform/dashboard.ts';
import { huidigeContentBron, beheerIngeschakeld, beheerZichtbaar, standaardBronnen } from '../src/platform/bron.ts';
import { sanityAanvraagStatus } from '../src/platform/migratie.ts';
import type { GebruikerRechten } from '../src/platform/types.ts';

const finance: GebruikerRechten = { isSuperAdmin: false, perModule: { finance: 'schrijven' } };
const geenFinance: GebruikerRechten = { isSuperAdmin: false, perModule: { finance: 'lezen' } };

describe('finance snapshots', () => {
  test('expositie in 2026 is €490, in 2029 €525; snapshot blijft 490', () => {
    const nu = kiesTarief(INITIELE_TARIEVEN, 'expositie', '2026-09-12');
    const later = kiesTarief(INITIELE_TARIEVEN, 'expositie', '2029-02-01');
    assert.equal(nu?.bedrag, 490);
    assert.equal(later?.bedrag, 525);
    const snap = tariefSnapshot(nu!, '2026-09-01');
    assert.equal(snap.bedrag, 490);
  });

  test('override vraagt reden en finance-schrijfrecht', () => {
    assert.equal(
      aanbetalingOverride({ standaardBedrag: 100, afgesprokenBedrag: 75, reden: '', rechten: finance }).ok,
      false,
    );
    assert.equal(
      aanbetalingOverride({ standaardBedrag: 100, afgesprokenBedrag: 75, reden: 'afwijkende afspraak', rechten: geenFinance }).ok,
      false,
    );
    const ok = aanbetalingOverride({
      standaardBedrag: 100,
      afgesprokenBedrag: 75,
      reden: 'afwijkende afspraak',
      rechten: finance,
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.audit?.naar, 75);
  });
});

describe('publicatie', () => {
  test('niet-definitieve boeking komt nooit in de agenda', () => {
    const uitkomst = beoordeelPublicatie({
      gekoppeldeBoekingStatus: 'optie',
      publiekeTitel: 'Expositie Jansen',
      datum: '2026-09-12',
      trigger: 'zodra_content_compleet',
      startYmd: '2026-09-12',
      nuYmd: '2026-09-01',
    });
    assert.equal(uitkomst.magOnline, false);
  });

  test('ontbrekende foto blokkeert minimale publicatie niet als het moment er is', () => {
    const uitkomst = beoordeelPublicatie({
      gekoppeldeBoekingStatus: 'definitief',
      publiekeTitel: 'Expositie Jansen',
      datum: '2026-09-12',
      trigger: 'uiterlijk_1_maand',
      startYmd: '2026-09-12',
      nuYmd: '2026-08-12',
    });
    assert.equal(uitkomst.magOnline, true);
    assert.equal(uitkomst.dashboardActie, true);
    assert.ok(uitkomst.ontbrekendeAanvulling.includes('foto'));
  });

  test('bruiloft zonder publieke activiteit blijft privé', () => {
    const uitkomst = beoordeelPublicatie({
      gekoppeldeBoekingStatus: 'definitief',
      trigger: 'niet_publiceren',
      startYmd: '2026-09-07',
      nuYmd: '2026-09-01',
    });
    assert.equal(uitkomst.magOnline, false);
  });
});

describe('communicatie idempotentie', () => {
  const sleutel = { boekingId: '2026-042', templateId: 'praktische_informatie', relatieId: '817' };

  test('al verzonden template gaat niet opnieuw', () => {
    const historie = [{ ...sleutel, status: 'verzonden' as const, templateVersie: 3 }];
    assert.equal(magAutomatischVerzenden(historie, sleutel).ok, false);
  });

  test('e-mailwijziging is geen nieuwe ontvanger; persoon vervangen wel', () => {
    assert.equal(emailWijzigingIsNieuweOntvanger(), false);
    assert.equal(isNieuweOntvanger('817', '818'), true);
    assert.equal(isNieuweOntvanger('817', '817'), false);
  });

  test('nieuwe exposant kan achterstallige info alsnog krijgen', () => {
    const actie = actieVoorNieuweOntvanger('direct_alsnog', [], {
      boekingId: '2026-042',
      templateId: 'praktische_informatie',
      relatieId: '818',
    });
    assert.equal(actie, 'versturen');
  });

  test('datumwijziging herplant alleen onverzonden mail', () => {
    assert.deepEqual(herplanNaDatumwijziging('verzonden'), { herplannen: false, waarschuwingVerouderd: true });
    assert.deepEqual(herplanNaDatumwijziging('gepland'), { herplannen: true, waarschuwingVerouderd: false });
  });

  test('annulering stopt toekomstige communicatie, historie blijft', () => {
    assert.equal(bijAnnulering('gepland'), 'geannuleerd');
    assert.equal(bijAnnulering('verzonden'), 'verzonden');
  });
});

describe('vrienden en nieuwsbrief', () => {
  test('bestaand inactief adres wordt heractiveerd, geen duplicaat', () => {
    assert.equal(aanmeldActie(null), 'aanmaken');
    assert.equal(aanmeldActie({ actief: false }), 'heractiveren');
    assert.equal(aanmeldActie({ actief: true }), 'ongewijzigd');
  });

  test('testnieuwsbrief telt niet als echte verzending', () => {
    assert.equal(isEchteVerzending('test'), false);
    assert.equal(naTestVerzending('concept'), 'concept');
    assert.equal(overslaan('concept').nieuweStatus, 'overgeslagen');
  });
});

describe('dashboard en bronnen', () => {
  test('Paul ziet geen aanvragen-tegel', () => {
    const paul: GebruikerRechten = { isSuperAdmin: false, perModule: { finance: 'schrijven', dashboard: 'lezen' } };
    const items = dashboardVoor(paul, {
      nieuweAanvragen: 2,
      optiesBijnaVerlopen: 1,
      optiesVerlopen: 0,
      aanbetalingenControleren: 2,
      activiteitMistContent: 1,
      communicatieKlaar: 0,
      nieuwsbriefVoorbereiden: 0,
      activiteiten7Dagen: 0,
      mailFout: 0,
    });
    assert.equal(items.some((item) => item.sleutel === 'nieuwe_aanvragen'), false);
    assert.equal(items.some((item) => item.sleutel === 'aanbetalingen_controleren'), true);
  });

  test('website blijft Sanity tot beide vlaggen aan staan', () => {
    assert.equal(huidigeContentBron({}), 'sanity');
    assert.equal(huidigeContentBron({ CONTENT_BRON: 'supabase' }), 'sanity');
    assert.equal(huidigeContentBron({ ALLOW_SUPABASE_CONTENT: 'true', CONTENT_BRON: 'supabase' }), 'supabase');
    assert.equal(huidigeContentBron({ ALLOW_SUPABASE_CONTENT: true, CONTENT_BRON: 'supabase' }), 'supabase');
    assert.equal(beheerIngeschakeld({}), false);
    assert.equal(beheerIngeschakeld({ BEHEER_ENABLED: true }), true);
    assert.equal(beheerZichtbaar({}), false);
    assert.equal(beheerZichtbaar({ BEHEER_ENABLED: 'true' }), true);
    assert.equal(beheerZichtbaar({ VERCEL_ENV: 'preview' }), true);
    assert.equal(beheerZichtbaar({ VERCEL_ENV: 'production' }), false);
    assert.equal(beheerZichtbaar({ DEV: true }), true);
    assert.equal(standaardBronnen().boekingen, 'sanity');
  });

  test('Sanity ja/nee wordt goedgekeurd/afgewezen', () => {
    assert.equal(sanityAanvraagStatus('ja'), 'goedgekeurd');
    assert.equal(sanityAanvraagStatus('nee'), 'afgewezen');
    assert.equal(sanityAanvraagStatus('nieuw'), 'nieuw');
  });
});
