import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { STANDAARD_MAILTEMPLATES } from '../src/platform/mailtemplates/catalog.ts';
import { MAILTEMPLATE_META } from '../src/platform/mailtemplates/meta.ts';
import { MAIL_PROCESFASEN, groepeerOpProces, sorteerOpProces } from '../src/platform/mailtemplates/proces.ts';
import { TEMPLATES_ALLEEN_CATALOGUS, TEMPLATES_LEGACY, TEMPLATES_MET_CALLER } from '../src/platform/automatisering.ts';

describe('mailtemplates in procesvolgorde', () => {
  test('elke bekende template staat precies één keer in een fase', () => {
    const geplaatst = MAIL_PROCESFASEN.flatMap((fase) => [...fase.templateIds]);
    const verwacht = [
      ...Object.keys(MAILTEMPLATE_META),
      ...TEMPLATES_MET_CALLER,
      ...TEMPLATES_ALLEEN_CATALOGUS,
      ...TEMPLATES_LEGACY,
    ];
    assert.equal(new Set(geplaatst).size, geplaatst.length);
    for (const id of verwacht) assert.ok(geplaatst.includes(id), id);
  });

  test('de catalogus volgt de fasen van aanvraag tot nazorg', () => {
    const ids = STANDAARD_MAILTEMPLATES.map((item) => item.id);
    const opnieuw = sorteerOpProces([...STANDAARD_MAILTEMPLATES].reverse()).map((item) => item.id);
    assert.deepEqual(ids, opnieuw);
    assert.equal(ids[0], 'booking_request_received');
    assert.ok(ids.indexOf('booking_approved_payment_required') < ids.indexOf('booking_content_request'));
    assert.ok(ids.indexOf('booking_content_request') < ids.indexOf('booking_practical_information'));
    assert.ok(ids.indexOf('booking_practical_information') < ids.indexOf('booking_review_request'));
    assert.equal(ids.at(-1), 'exhibition_weekend_available');
  });

  test('lege fasen verdwijnen en onbekende templates komen achteraan', () => {
    const groepen = groepeerOpProces([
      { id: 'booking_review_request', naam: 'Review' },
      { id: 'losse_mail', naam: 'Zebra' },
      { id: 'booking_request_received', naam: 'Ontvangen' },
      { id: 'andere_mail', naam: 'Aap' },
    ]);
    assert.deepEqual(
      groepen.map((groep) => groep.titel),
      ['Aanvraag', 'Na afloop', 'Overig'],
    );
    assert.deepEqual(
      groepen.at(-1)?.templates.map((item) => item.id),
      ['andere_mail', 'losse_mail'],
    );
  });
});
