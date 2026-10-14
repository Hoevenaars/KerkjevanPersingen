import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { actueleVerzendingen, communicatieStappen, geplandeJobsTeAnnuleren, type CommunicatieContext } from '../src/platform/continuiteit.ts';
import { jobDedupSleutel } from '../src/lib/operatie/kern.ts';
import { GOOGLE_REVIEW_URL, googleReviewUrl } from '../src/lib/google-review.ts';
import { CONTRACTBEHEER_EMAIL, NOREPLY_ADRES } from '../src/lib/mail-adressen.ts';
import { bouwResendInhoud } from '../src/lib/mail-transport.ts';
import { renderMailBericht } from '../src/platform/mailtemplates/render.ts';
import { standaardTemplate } from '../src/platform/mailtemplates/catalog.ts';
import { geplandeMailsVoorBoeking } from '../src/platform/mailtemplates/workflow.ts';
import { VOORBEELD_VARIABELEN } from '../src/platform/mailtemplates/voorbeeld.ts';
import { KERKJE_MAIL_MERK } from '../src/lib/kerkje-mail.ts';
import type { DemoBoeking } from '../src/platform/demo-data.ts';

function ctx(extra: Partial<CommunicatieContext> = {}): CommunicatieContext {
  return {
    status: 'definitief',
    start: '2027-06-12',
    eind: '2027-06-13',
    verhuurtype: 'expositie',
    publicatieTrigger: 'niet_publiceren',
    inhoudStatus: 'niet_vereist',
    aanbetalingOntvangen: true,
    aanbetalingVerplicht: true,
    optieAangemaaktOp: null,
    betaaldeadline: null,
    gastheerAanwezig: false,
    verzonden: new Set(),
    vandaag: '2027-01-01',
    geannuleerd: false,
    ...extra,
  };
}

function reviewOp(extra: Partial<CommunicatieContext> = {}): string | undefined {
  return communicatieStappen(ctx(extra)).find((stap) => stap.templateId === 'booking_review_request')?.geplandOp;
}

describe('reviewmail na de einddatum', () => {
  test('eendaagse activiteit is één dag na die dag', () => {
    assert.equal(reviewOp({ start: '2027-06-14', eind: '2027-06-14' }), '2027-06-15');
  });

  test('weekendactiviteit is één dag na zondag', () => {
    assert.equal(reviewOp({ start: '2027-06-12', eind: '2027-06-13' }), '2027-06-14');
  });

  test('meerdaagse activiteit is één dag na de laatste dag', () => {
    assert.equal(reviewOp({ start: '2027-06-10', eind: '2027-06-16' }), '2027-06-17');
  });

  test('geannuleerde boeking levert geen reviewstap', () => {
    assert.equal(reviewOp({ status: 'geannuleerd' }), undefined);
    assert.equal(actueleVerzendingen(ctx({ status: 'geannuleerd', vandaag: '2027-06-20' })).some((stap) => stap.templateId === 'booking_review_request'), false);
  });

  test('geannuleerde activiteit levert geen reviewstap en annuleert een open job', () => {
    const situatie = ctx({ geannuleerd: true, vandaag: '2027-06-20' });
    assert.equal(reviewOp({ geannuleerd: true }), undefined);
    assert.deepEqual(geplandeJobsTeAnnuleren(situatie, ['booking_review_request']), ['booking_review_request']);
  });

  test('de reviewjob gebruikt één dedupsleutel per boeking', () => {
    assert.equal(jobDedupSleutel('42', 'booking_review_request'), 'job:42:booking_review_request');
  });

  test('de knop en de tekst wijzen naar dezelfde Google Review-pagina', () => {
    const tpl = standaardTemplate('booking_review_request');
    assert.ok(tpl);
    const brief = renderMailBericht(tpl, VOORBEELD_VARIABELEN);
    assert.equal(brief.html.split(KERKJE_MAIL_MERK).length - 1, 1);
    assert.equal(brief.html.includes('{{'), false);
    assert.match(brief.html, /Laat een Google Review achter/);
    assert.match(brief.html, new RegExp(GOOGLE_REVIEW_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(brief.text, new RegExp(GOOGLE_REVIEW_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(/<\/?[a-z][^>]*>/i.test(brief.text), false);
    const inhoud = bouwResendInhoud({
      naar: 'nhoevenaars@gmail.com',
      onderwerp: tpl.onderwerp,
      tekst: brief.text,
      html: brief.html,
      sleutel: 'nazorg',
      templateId: 'booking_review_request',
      ontvangerRol: 'huurder',
      aanvragerEmail: 'aanvrager.test@example.com',
    });
    assert.equal(inhoud.replyTo, CONTRACTBEHEER_EMAIL);
    assert.equal(inhoud.replyTo.includes(NOREPLY_ADRES), false);
    assert.deepEqual(inhoud.to, ['nhoevenaars@gmail.com']);
  });

  test('zonder review-url blijft de mail leesbaar en zonder kapotte knop', () => {
    process.env.GOOGLE_REVIEW_URL = '';
    try {
      const tpl = standaardTemplate('booking_review_request');
      assert.ok(tpl);
      const brief = renderMailBericht(tpl, VOORBEELD_VARIABELEN);
      assert.equal(brief.html.includes('href=""'), false);
      assert.equal(brief.html.includes(GOOGLE_REVIEW_URL), false);
      assert.match(brief.html, /fijne ervaring/);
      assert.equal(googleReviewUrl(), '');
    } finally {
      delete process.env.GOOGLE_REVIEW_URL;
    }
  });

  test('de planning toont de review pas na de einddatum en niet bij annulering', () => {
    const tpl = standaardTemplate('booking_review_request');
    assert.ok(tpl);
    const basis: DemoBoeking = {
      id: 'b-review',
      nummer: '2027-014',
      status: 'definitief',
      interneTitel: 'Expositie',
      soort: 'expositie',
      start: '2027-06-12',
      eind: '2027-06-14',
      huurder: 'Jan Jansen',
      email: 'jan@voorbeeld.nl',
      tarief: '',
      aanbetaling: '',
      aanbetalingBinnen: true,
      publiek: true,
      notities: '',
      relatieId: 'r-1',
    };
    const gepland = geplandeMailsVoorBoeking(basis, [tpl], [], new Date('2027-06-01T12:00:00Z'));
    assert.equal(gepland.find((mail) => mail.templateId === 'booking_review_request')?.geplandOp, '2027-06-15');
    const geannuleerd = geplandeMailsVoorBoeking({ ...basis, status: 'geannuleerd' }, [tpl], [], new Date('2027-06-01T12:00:00Z'));
    assert.equal(geannuleerd.some((mail) => mail.templateId === 'booking_review_request'), false);
  });
});
