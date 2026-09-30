import assert from 'node:assert/strict';
import test from 'node:test';
import { inhoudJson, parseTemplateInhoud, templateUitRijen } from '../src/platform/mailtemplates/supabase-bron.ts';
import { instellingRijen } from '../src/platform/beheer-supabase-schrijf.ts';

test('template-json uit Supabase rondt canoniek terug zonder catalogus', () => {
  const lichaam = parseTemplateInhoud('Onderwerp', inhoudJson({
    onderwerp: 'Onderwerp',
    aanhef: 'Beste {{voornaam}},',
    introductie: '',
    hoofdtekst: 'Tekst uit de catalogus.',
    callToActionTekst: '',
    secundaireTekst: '',
    slottekst: '',
    ondertekening: 'Bestuur',
    knoppen: [],
    categorie: 'Aanvraag',
    ontvanger: 'Aanvrager',
    cc: '',
    bcc: '',
    verzendwijze: 'besluit',
    trigger: {
      soort: 'besluit_afwijzing',
      beschrijving: 'Bestuur bevestigt afwijzing',
      automatischVersturen: false,
      conceptKlaarzetten: false,
    },
  }));
  assert.equal(lichaam.hoofdtekst, 'Tekst uit de catalogus.');
  assert.equal(lichaam.verzendwijze, 'besluit');
  const def = templateUitRijen(
    {
      sleutel: 'afwijzing',
      naam: 'Aanvraag afgewezen',
      actief: true,
      ontvanger_rol: 'huurder',
      trigger_soort: 'handmatig',
      termijn_waarde: null,
      termijn_eenheid: null,
      verzendwijze: 'handmatig',
      huidige_versie: 1,
    },
    { sleutel: 'afwijzing', versie: 1, onderwerp: 'Aanvraag afgewezen', inhoud: 'Beste {naam},' },
  );
  assert.equal(def.id, 'afwijzing');
  assert.equal(def.hoofdtekst, 'Beste {naam},');
  assert.equal(def.onderwerp, 'Aanvraag afgewezen');
});

test('instellingenrijen gebruiken alleen de ingevoerde waarden', () => {
  const rijen = instellingRijen({
    openingVan: '11:00',
    openingTot: '17:00',
    contractbeheerder: '',
    ontvangstAdres: 'aanvraag@example.test',
    extraOntvangstAdres: '',
    penningmeesterAdres: '',
  });
  const map = new Map(rijen.map((rij) => [rij.sleutel, rij.waarde]));
  assert.deepEqual(map.get('expositie_openingstijden'), { van: '11:00', tot: '17:00' });
  assert.equal(map.get('ontvangst_adres'), 'aanvraag@example.test');
  assert.equal(map.get('contractbeheerder'), '');
  assert.equal(rijen.some((rij) => rij.waarde === 'Nelleke'), false);
});
