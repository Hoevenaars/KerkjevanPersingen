import assert from 'node:assert/strict';
import test from 'node:test';
import { STANDAARD_AUTOMATISERINGEN, type Automatisering, type AutomatiseringStatus } from '../src/platform/automatisering.ts';
import {
  BETALING_DICHT,
  betalingscommunicatieBesluit,
  isBetalingsTemplate,
} from '../src/platform/betalingscommunicatie.ts';
import { actueleVerzendingen, type CommunicatieContext } from '../src/platform/continuiteit.ts';
import { verstuurGecontroleerd } from '../src/lib/mail-transport.ts';
import { besluitContractViaSessie } from '../src/lib/operatie/contract-besluit.ts';

function registerMet(status: Partial<Record<string, AutomatiseringStatus>>): Automatisering[] {
  return STANDAARD_AUTOMATISERINGEN.map((item) => ({
    ...item,
    status: status[item.sleutel] ?? item.status,
  }));
}

const betaling: CommunicatieContext = {
  status: 'definitief',
  start: '2027-02-12',
  verhuurtype: 'concert',
  publicatieTrigger: 'niet_publiceren',
  inhoudStatus: 'niet_vereist',
  aanbetalingOntvangen: false,
  aanbetalingVerplicht: true,
  optieAangemaaktOp: '2026-11-01',
  betaaldeadline: '2026-11-15',
  gastheerAanwezig: false,
  verzonden: new Set(),
  vandaag: '2026-11-17',
};

test('A een ontbrekende of uitgezette poort blokkeert elke betalingsroute', () => {
  assert.equal(betalingscommunicatieBesluit(undefined).modus, 'uit');
  assert.equal(betalingscommunicatieBesluit([]).modus, 'uit');
  assert.equal(betalingscommunicatieBesluit(STANDAARD_AUTOMATISERINGEN).modus, 'uit');
  assert.equal(betalingscommunicatieBesluit(registerMet({ betaalherinnering: 'actief', statusmail_huurder: 'actief' })).modus, 'uit');
  assert.equal(isBetalingsTemplate('booking_payment_reminder'), true);
  assert.equal(isBetalingsTemplate('booking_confirmed'), false);
});

test('B een featurevlag of een herstart zet de poort niet aan', () => {
  const metVlag = registerMet({});
  assert.equal(betalingscommunicatieBesluit(metVlag).modus, 'uit');
  assert.equal(betalingscommunicatieBesluit(metVlag).provider, false);
  const opnieuw = betalingscommunicatieBesluit(STANDAARD_AUTOMATISERINGEN);
  assert.equal(opnieuw.modus, 'uit');
});

test('C een al geplande betalingsstap gaat niet uit zolang de poort uit staat', () => {
  assert.equal(actueleVerzendingen(betaling).some((stap) => stap.keten === 'betaling'), false);
  const historisch = actueleVerzendingen({ ...betaling, betalingsActiefVanaf: '2026-11-17' });
  assert.equal(historisch.some((stap) => stap.keten === 'betaling'), false);
});

test('D alleen een expliciet aangezette poort laat een verschuldigde stap toe, geen oude', () => {
  assert.equal(betalingscommunicatieBesluit(registerMet({ betalingscommunicatie: 'actief' })).modus, 'aan');
  const vandaag = actueleVerzendingen({
    ...betaling,
    vandaag: '2026-11-08',
    betalingsActiefVanaf: '2026-11-08',
  });
  assert.equal(vandaag.some((stap) => stap.templateId === 'booking_payment_reminder'), true);
  const alVerstuurd = actueleVerzendingen({
    ...betaling,
    vandaag: '2026-11-08',
    betalingsActiefVanaf: '2026-11-08',
    verzonden: new Set(['booking_payment_reminder']),
  });
  assert.equal(alVerstuurd.some((stap) => stap.templateId === 'booking_payment_reminder'), false);
});

test('E uit opnieuw blokkeert cron, herhaling en een handmatige route', async () => {
  let provider = 0;
  const register = registerMet({
    betalingscommunicatie: 'uit',
    betaalherinnering: 'actief',
    statusmail_huurder: 'actief',
    handmatige_template: 'actief',
  });
  const transport = { async verstuur() { provider += 1; return 'mag-niet'; } };
  const herinnering = await verstuurGecontroleerd(
    { sleutel: 'betaalherinnering', naar: 'huurder@example.com', onderwerp: 'Herinnering', tekst: 'Open betaling', templateId: 'booking_payment_reminder' },
    { register, transport },
  );
  const handmatig = await verstuurGecontroleerd(
    { sleutel: 'handmatige_template', naar: 'huurder@example.com', onderwerp: 'Betaling', tekst: 'Rond de betaling af', templateId: 'booking_approved_payment_required' },
    { register, transport },
  );
  const factuurBijlage = await verstuurGecontroleerd(
    {
      sleutel: 'handmatige_template',
      naar: 'huurder@example.com',
      onderwerp: 'Contract',
      tekst: 'Bijlage',
      bijlagen: [{ bestandsnaam: 'factuur-van-het-moment.pdf', inhoud: new Uint8Array([1]) }],
    },
    { register, transport },
  );
  assert.equal(herinnering.providerAangeroepen, false);
  assert.equal(handmatig.providerAangeroepen, false);
  assert.equal(factuurBijlage.providerAangeroepen, false);
  assert.match(herinnering.melding ?? '', /Betalingscommunicatie staat uit/);
  assert.equal(provider, 0);
  assert.equal(actueleVerzendingen({ ...betaling, betalingsActiefVanaf: '2026-11-08', vandaag: '2026-11-17' }).some((stap) => stap.geplandOp < '2026-11-08'), false);
});

test('F de tweede Ja verstuurt geen factuurmail en valt niet terug op een onvolledig pakket', async () => {
  let geraakt = false;
  const uit = await besluitContractViaSessie({
    client: { from() { geraakt = true; throw new Error('database'); } } as never,
    env: { FACTUURPAKKET_V3: 'true', DOCUMENTENFLOW: 'true', V4_ATOMAIR_CONTRACT: 'true' },
    actor: {
      type: 'gebruiker',
      naam: 'Bestuur',
      rechten: { isSuperAdmin: false, perModule: { aanvragen: 'schrijven', instellingen: 'schrijven', boekingen: 'schrijven' } },
    },
    boekingId: '18',
    besluit: 'ja',
    verwachteVersie: 1,
    modus: 'aan',
    testadres: null,
    promotieAanwezig: false,
    verstuur: async () => {
      geraakt = true;
      return { verzonden: true, berichtId: 'provider', melding: 'verstuurd' };
    },
  });
  assert.equal(uit.ok, false);
  assert.equal(uit.melding, BETALING_DICHT);
  assert.equal(geraakt, false);
});
