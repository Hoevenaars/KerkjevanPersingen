import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { STANDAARD_MAILTEMPLATES, standaardTemplate } from '../src/platform/mailtemplates/catalog.ts';
import { onderwerpUitTemplate, renderMailHtml } from '../src/platform/mailtemplates/render.ts';
import { VOORBEELD_VARIABELEN } from '../src/platform/mailtemplates/voorbeeld.ts';
import { geplandeMailsVoorBoeking } from '../src/platform/mailtemplates/workflow.ts';
import { maakActieToken, leesActieToken } from '../src/platform/mailtemplates/actie.ts';
import type { DemoBoeking } from '../src/platform/demo-data.ts';

describe('mailtemplates 3.0 catalogus', () => {
  test('27 standaardtemplates met vaste IDs', () => {
    assert.equal(STANDAARD_MAILTEMPLATES.length, 27);
    assert.ok(standaardTemplate('booking_request_received'));
    assert.ok(standaardTemplate('host_post_event_check'));
  });

  test('onderwerp en HTML bevatten ingevulde variabelen', () => {
    const tpl = standaardTemplate('booking_request_received')!;
    const onderwerp = onderwerpUitTemplate(tpl, VOORBEELD_VARIABELEN);
    assert.match(onderwerp, /Kerkje van Persingen/);
    const html = renderMailHtml(tpl, VOORBEELD_VARIABELEN);
    assert.match(html, /Jan/);
    assert.match(html, /Pianoconcert/);
  });

  test('definitieve boeking krijgt geplande content- en praktische mails', () => {
    const boeking: DemoBoeking = {
      id: 'b-test',
      nummer: '2027-001',
      status: 'definitief',
      interneTitel: 'Test',
      soort: 'expositie',
      start: '2027-06-14',
      eind: '2027-06-15',
      huurder: 'Jan Jansen',
      email: 'jan@voorbeeld.nl',
      tarief: '€250',
      aanbetaling: '€100',
      aanbetalingBinnen: true,
      publiek: true,
      notities: '',
      relatieId: 'r-1',
      gastheerId: 'g-1',
    };
    const gepland = geplandeMailsVoorBoeking(boeking, STANDAARD_MAILTEMPLATES, [], new Date('2027-01-01'));
    const ids = gepland.map((g) => g.templateId);
    assert.ok(ids.includes('booking_content_request'));
    assert.ok(ids.includes('booking_practical_information'));
  });

  test('e-mailactie vereist token en verloopt niet direct', () => {
    const token = maakActieToken({
      actie: 'goedkeuren',
      boekingId: 'b-1',
      templateId: 'internal_booking_review_required',
    });
    const payload = leesActieToken(token);
    assert.equal(payload?.actie, 'goedkeuren');
  });
});
