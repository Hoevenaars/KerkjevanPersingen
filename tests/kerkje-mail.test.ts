import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { bestuurMail } from '../src/lib/aanvraag.ts';
import { KERKJE_LOGO_URL, KERKJE_MAIL_MERK, kerkjeMail } from '../src/lib/kerkje-mail.ts';
import { bouwResendInhoud } from '../src/lib/mail-transport.ts';
import { CONTRACTBEHEER_EMAIL } from '../src/lib/mail-adressen.ts';
import { nieuwsbriefEnvelop, NIEUWSBRIEF_REPLY_TO } from '../src/lib/nieuwsbrief-html.ts';
import { mailMeta } from '../src/lib/nieuwsbrief-frequentie.ts';
import { renderMailBericht } from '../src/platform/mailtemplates/render.ts';
import { standaardTemplate } from '../src/platform/mailtemplates/catalog.ts';
import { VOORBEELD_VARIABELEN } from '../src/platform/mailtemplates/voorbeeld.ts';
import type { Aanvraag } from '../src/lib/validatie.ts';

const TO = 'nhoevenaars@gmail.com';
const AANVRAGER = 'aanvrager.test@example.com';

function eenKaart(html: string): void {
  const keren = html.split(KERKJE_MAIL_MERK).length - 1;
  assert.equal(keren, 1);
  assert.match(html, /max-width:560px/);
  assert.match(html, new RegExp(KERKJE_LOGO_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(html, /Zegel van het Kerkje van Persingen/);
  assert.match(html, /Kerkje van Persingen/);
  assert.equal(html.includes('{{'), false);
}

function geenRuweHtml(tekst: string): void {
  assert.equal(/<\/?[a-z][^>]*>/i.test(tekst), false);
}

const aanvraag: Aanvraag = {
  naam: 'Test Aanvrager',
  email: AANVRAGER,
  telefoon: '0612345678',
  adres: 'Dorpsstraat 1',
  soort: 'concert',
  datum: '2027-06-14',
  datumTot: '2027-06-14',
  personen: '40',
  toelichting: 'Een kort concert.',
  website: '',
  eerderGeexposeerd: '',
  medeExposanten: '',
  akkoordVoorwaarden: 'ja',
  negeerWaarschuwing: '',
};

describe('centrale Kerkje-mail', () => {
  test('interne verhuuraanvraag heeft één kaart, tekst en aanvrager als Reply-To', () => {
    const brief = bestuurMail(aanvraag);
    eenKaart(brief.html);
    assert.match(brief.html, /Huuraanvraag/);
    assert.match(brief.html, /Test Aanvrager/);
    assert.match(brief.text, /Test Aanvrager/);
    assert.match(brief.text, /Een kort concert/);
    geenRuweHtml(brief.text);
    const inhoud = bouwResendInhoud({
      naar: TO,
      onderwerp: 'Nieuwe verhuuraanvraag',
      tekst: brief.text,
      html: brief.html,
      sleutel: 'aanvraag_bestuur',
      aanvragerEmail: AANVRAGER,
      aanvragerNaam: 'Test Aanvrager',
      richting: 'intern',
    });
    assert.deepEqual(inhoud.to, [TO]);
    assert.equal(inhoud.replyTo, AANVRAGER);
    assert.match(inhoud.html ?? '', /data-kerkje-mail/);
    assert.ok(inhoud.text && inhoud.text.length > 40);
  });

  const stromen: { id: string; template: string; sleutel: string; rol: string; antwoordNaarAanvrager: boolean; cta?: string }[] = [
    { id: 'aanvraagbevestiging', template: 'booking_request_received', sleutel: 'aanvraag_bevestiging', rol: 'huurder', antwoordNaarAanvrager: false },
    { id: 'reservering-definitief', template: 'booking_confirmed', sleutel: 'statusmail_huurder', rol: 'huurder', antwoordNaarAanvrager: false },
    { id: 'contentverzoek', template: 'booking_content_request', sleutel: 'content_herinnering', rol: 'huurder', antwoordNaarAanvrager: false, cta: 'Informatie aanleveren' },
    { id: 'praktisch-huurder', template: 'booking_practical_information', sleutel: 'herinnering', rol: 'huurder', antwoordNaarAanvrager: false },
    { id: 'praktisch-gastheer', template: 'host_practical_information', sleutel: 'gastheer_mail', rol: 'gastheer', antwoordNaarAanvrager: false },
    { id: 'review', template: 'booking_review_request', sleutel: 'nazorg', rol: 'huurder', antwoordNaarAanvrager: false },
    { id: 'interne-melding', template: 'internal_content_overdue', sleutel: 'content_herinnering', rol: 'bestuur', antwoordNaarAanvrager: true },
  ];

  for (const stroom of stromen) {
    test(`${stroom.id} gebruikt de kaart, tekst en het juiste Reply-To`, () => {
      const tpl = standaardTemplate(stroom.template);
      assert.ok(tpl, stroom.template);
      const brief = renderMailBericht(tpl, VOORBEELD_VARIABELEN, {
        voorbeeldUrl: 'https://kerkjepersingen.nl/klant/aanleveren/?token=test',
      });
      eenKaart(brief.html);
      assert.match(brief.html, /Jan/);
      assert.match(brief.text, /Jan/);
      geenRuweHtml(brief.text);
      if (stroom.cta) {
        assert.match(brief.html, new RegExp(stroom.cta));
        assert.match(brief.text, new RegExp(stroom.cta));
        assert.match(brief.text, /kerkjepersingen\.nl\/klant\/aanleveren/);
      }
      const inhoud = bouwResendInhoud({
        naar: TO,
        onderwerp: tpl.onderwerp,
        tekst: brief.text,
        html: brief.html,
        sleutel: stroom.sleutel,
        templateId: stroom.template,
        ontvangerRol: stroom.rol,
        aanvragerEmail: AANVRAGER,
        aanvragerNaam: 'Test Aanvrager',
      });
      assert.deepEqual(inhoud.to, [TO]);
      assert.equal(inhoud.replyTo, stroom.antwoordNaarAanvrager ? AANVRAGER : CONTRACTBEHEER_EMAIL);
      assert.equal((inhoud.html ?? '').split(KERKJE_MAIL_MERK).length - 1, 1);
    });
  }

  test('een tweede omlijsting wordt geweigerd', () => {
    const eerste = kerkjeMail({ titel: 'Eerste', hoofdtekst: 'Inhoud' });
    assert.throws(() => kerkjeMail({ titel: 'Tweede', extraBlok: eerste.html }));
  });

  test('nieuwsbrief blijft een eigen layout met tekst, afmelden en vast Reply-To', () => {
    const brief = nieuwsbriefEnvelop(
      { kortNieuws: 'Een korte noot voor de vrienden.' },
      [],
      'https://kerkjepersingen.nl/vrienden/afmelden/?token=mailveiligheid-test',
      mailMeta('wekelijks'),
    );
    assert.equal(brief.replyTo, NIEUWSBRIEF_REPLY_TO);
    assert.equal(brief.replyTo, CONTRACTBEHEER_EMAIL);
    assert.equal(brief.html.includes(KERKJE_MAIL_MERK), false);
    assert.match(brief.html, /vrienden\/afmelden/);
    assert.match(brief.html, /verhuur-ruimte\.jpg/);
    assert.match(brief.text, /Een korte noot voor de vrienden/);
    assert.match(brief.text, /token=mailveiligheid-test/);
    geenRuweHtml(brief.text);
  });
});
