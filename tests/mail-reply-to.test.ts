import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { TEMPLATES_LEGACY } from '../src/platform/automatisering.ts';
import { MAILTEMPLATE_META } from '../src/platform/mailtemplates/meta.ts';
import {
  CONTRACTBEHEER_EMAIL,
  NOREPLY_ADRES,
  VAN_ADRES,
  replyToVoor,
} from '../src/lib/mail-adressen.ts';
import { bouwResendInhoud } from '../src/lib/mail-transport.ts';
import { legeWereld, voerOpdrachtUit, type DienstContext } from '../src/lib/operatie/kern.ts';

const AANVRAGER = 'aanvrager@example.nl';

function bronnen(map: string): string[] {
  const uit: string[] = [];
  for (const naam of readdirSync(map)) {
    const pad = path.join(map, naam);
    if (statSync(pad).isDirectory()) {
      if (naam === 'node_modules' || naam === 'dist') continue;
      uit.push(...bronnen(pad));
    } else if (/\.(ts|tsx|astro|js|mjs)$/.test(naam)) {
      uit.push(pad);
    }
  }
  return uit;
}

test('elke resend-aanroep loopt via het centrale reply-to pad', () => {
  const treffers = bronnen(path.join(process.cwd(), 'src')).filter((pad) =>
    readFileSync(pad, 'utf8').includes('emails.send'),
  );
  assert.deepEqual(
    treffers.map((pad) => path.relative(process.cwd(), pad)),
    ['src/lib/mail-transport.ts'],
  );
});

test('from blijft het sending-only adres en reply-to nooit noreply', () => {
  const intern = bouwResendInhoud({
    naar: CONTRACTBEHEER_EMAIL,
    onderwerp: 'Nieuwe verhuuraanvraag',
    tekst: 'test',
    sleutel: 'aanvraag_bestuur',
    replyTo: AANVRAGER,
  });
  const huurder = bouwResendInhoud({
    naar: AANVRAGER,
    onderwerp: 'Aanvraag ontvangen',
    tekst: 'test',
    templateId: 'booking_request_received',
    aanvragerEmail: AANVRAGER,
  });
  const geforceerd = bouwResendInhoud({
    naar: AANVRAGER,
    onderwerp: 'test',
    tekst: 'test',
    replyTo: NOREPLY_ADRES,
    templateId: 'booking_confirmed',
  });
  assert.equal(intern.from, VAN_ADRES);
  assert.equal(huurder.from, VAN_ADRES);
  assert.equal(intern.replyTo, AANVRAGER);
  assert.equal(huurder.replyTo, CONTRACTBEHEER_EMAIL);
  assert.equal(geforceerd.replyTo, CONTRACTBEHEER_EMAIL);
  for (const inhoud of [intern, huurder, geforceerd]) {
    assert.equal(inhoud.replyTo.includes('noreply@'), false);
    assert.equal(inhoud.from.includes(NOREPLY_ADRES), true);
  }
});

test('reply-to volgt de ontvanger van elk mailtemplate', () => {
  const ids = new Set([...Object.keys(MAILTEMPLATE_META), ...TEMPLATES_LEGACY]);
  for (const id of ids) {
    const reply = replyToVoor({ templateId: id, aanvragerEmail: AANVRAGER });
    const meta = MAILTEMPLATE_META[id];
    const ontvanger = meta?.ontvanger.toLowerCase() ?? '';
    const naarAanvrager =
      id === 'internal_booking_review_required' ||
      id === 'internal_booking_information_received' ||
      id === 'internal_payment_overdue' ||
      id === 'internal_content_overdue' ||
      id === 'internal_content_review_required' ||
      id === 'aanbetaling_check_paul' ||
      id === 'content_ter_beoordeling' ||
      id === 'optie_verlopen_contractbeheerder' ||
      (ontvanger.includes('bestuur') && !ontvanger.includes('planning')) ||
      ontvanger.includes('finance');
    if (id === 'internal_host_required') {
      assert.equal(reply, CONTRACTBEHEER_EMAIL, id);
    } else if (naarAanvrager) {
      assert.equal(reply, AANVRAGER, id);
    } else {
      assert.equal(reply, CONTRACTBEHEER_EMAIL, id);
    }
    assert.equal(reply.includes(NOREPLY_ADRES), false, id);
  }
});

test('nieuwe aanvraag mailt contractbeheer met reply-to van de aanvrager', async () => {
  const verzonden: { naar: string; replyTo?: string; templateSleutel?: string }[] = [];
  const ctx: DienstContext = {
    nu: new Date('2027-01-01T10:00:00Z'),
    env: {
      VERCEL_ENV: 'preview',
      MAIL_STAGING_ALLOWLIST: `${AANVRAGER},${CONTRACTBEHEER_EMAIL}`,
    },
    actor: { type: 'systeem', naam: 'test' },
    basisUrl: 'https://kerkjepersingen.nl',
    internEmail: CONTRACTBEHEER_EMAIL,
  };
  const uit = await voerOpdrachtUit(
    legeWereld(),
    {
      soort: 'dien_aanvraag',
      naam: 'Test Aanvrager',
      email: AANVRAGER,
      verhuurtype: 'bruiloft',
      start: '2027-05-04',
      eind: '2027-05-04',
    },
    ctx,
    {
      async verstuur(input) {
        verzonden.push({ naar: input.naar, replyTo: input.replyTo, templateSleutel: input.templateSleutel });
      },
    },
  );
  assert.equal(uit.resultaat.ok, true);
  const intern = verzonden.find((mail) => mail.templateSleutel === 'internal_booking_review_required');
  const bevestiging = verzonden.find((mail) => mail.templateSleutel === 'booking_request_received');
  assert.ok(intern);
  assert.ok(bevestiging);
  assert.equal(intern.naar, CONTRACTBEHEER_EMAIL);
  assert.equal(intern.replyTo, AANVRAGER);
  assert.equal(bevestiging.naar, AANVRAGER);
  assert.equal(bevestiging.replyTo, CONTRACTBEHEER_EMAIL);
  assert.equal(verzonden.some((mail) => mail.replyTo === NOREPLY_ADRES), false);
});
