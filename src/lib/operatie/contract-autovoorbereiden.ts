/** Na het eerste bestuurs-Ja alleen een contract voorbereiden als ALLE afspraken
 * al expliciet in Supabase zijn vastgelegd. Geen extra formulier of schatting.
 * Bij afwijking blijft de bestaande, vooringevulde wizard de veilige fallback.
 */
import { ymdInAmsterdam } from '../../platform/datum.ts';
import { kiesTarief, type Tariefregel } from '../../platform/finance.ts';
import { leesInstellingen } from '../../platform/documentenflow.ts';
import { controleerWizard, wizardUitDossier } from '../../platform/contract-wizard.ts';
import { berekenAutocontractTermijnen, leesAutocontractProfiel } from '../../platform/autocontract-profiel.ts';
import type { Actor } from './kern.ts';
import type { DossierSessie } from './dossier-sessie.ts';
import { bewaarDefinitiefContract, type ContractWizardSessie } from './contract-wizard-sessie.ts';

type Rij = Record<string, unknown>;
const tekst = (v: unknown) => v == null ? '' : String(v).trim();
const getal = (v: unknown) => v == null || v === '' ? NaN : Number(v);

export async function probeerContractAutoVoorbereiden(input: {
  client: DossierSessie;
  actor: Actor;
  aanvraagId: number;
  boekingId: number;
  env: Record<string, unknown>;
}): Promise<{ voorbereid: boolean; melding: string }> {
  if (input.env.V4_AUTOCONTRACT !== 'true') return { voorbereid: false, melding: '' };
  if (input.env.V4_ATOMAIR_CONTRACT !== 'true') {
    return { voorbereid: false, melding: 'Automatisch contract maken vereist eerst de veilige, transactionele contractopslag.' };
  }
  try {
    const [aanvraag, boeking, tariefAntwoord, instellingAntwoord] = await Promise.all([
      input.client.from('aanvragen').select('id,naam,email,telefoon,straat,huisnummer,huisnummer_toevoeging,postcode,woonplaats,verhuurtype_sleutel,start_datum,eind_datum,aantal_personen').eq('id', input.aanvraagId).maybeSingle(),
      input.client.from('boekingen').select('id,status,verhuurtype_sleutel,interne_titel,tarief_bedrag,start_datum,eind_datum').eq('id', input.boekingId).maybeSingle(),
      input.client.from('tarieven').select('verhuurtype_sleutel,prijstype,bedrag,geldig_vanaf,geldig_tot'),
      input.client.from('instellingen').select('sleutel,waarde'),
    ]);
    if (aanvraag.error || boeking.error || tariefAntwoord.error || instellingAntwoord.error ||
        !aanvraag.data || !boeking.data || boeking.data.status !== 'optie') {
      return { voorbereid: false, melding: 'Contractgegevens niet betrouwbaar beschikbaar; controleer de bestaande contractwizard.' };
    }
    const a = aanvraag.data as Rij;
    const b = boeking.data as Rij;
    const soort = tekst(a.verhuurtype_sleutel || b.verhuurtype_sleutel);
    if (a.verhuurtype_sleutel && b.verhuurtype_sleutel &&
        tekst(a.verhuurtype_sleutel) !== tekst(b.verhuurtype_sleutel)) {
      return { voorbereid: false, melding: 'Het verhuurtype van aanvraag en boeking verschilt. Eerst administratief controleren.' };
    }
    const start = tekst(a.start_datum);
    const eind = tekst(a.eind_datum);
    if (!soort || !start || !eind) return { voorbereid: false, melding: 'Verhuurtype of periode ontbreekt.' };
    if (tekst(b.start_datum) !== start || tekst(b.eind_datum) !== eind) {
      return { voorbereid: false, melding: 'De reservering en aanvraag hebben verschillende data. Eerst beschikbaarheid en bestuurstoestemming controleren.' };
    }
    const alleTarieven: Tariefregel[] = (tariefAntwoord.data ?? []).map((r) => ({
      verhuurtype: tekst(r.verhuurtype_sleutel),
      prijstype: tekst(r.prijstype) as Tariefregel['prijstype'],
      bedrag: r.bedrag == null ? null : getal(r.bedrag),
      geldigVanaf: tekst(r.geldig_vanaf), geldigTot: tekst(r.geldig_tot) || null,
    }));
    const tarief = kiesTarief(alleTarieven, soort, start);
    if (!tarief || tarief.prijstype !== 'vast' || !Number.isFinite(tarief.bedrag) || tarief.bedrag == null || tarief.bedrag <= 0) {
      return { voorbereid: false, melding: 'Er is geen definitief vast tarief. Laat het bestuur eerst de huurprijs vaststellen.' };
    }
    if (b.tarief_bedrag != null && getal(b.tarief_bedrag) !== tarief.bedrag) {
      return { voorbereid: false, melding: 'Het bestaande boekingstarief wijkt af van het vaste tarief. Niet automatisch overschrijven.' };
    }
    const instellingen = (instellingAntwoord.data ?? []) as { sleutel: string; waarde: unknown }[];
    const profielData = instellingen.find((r) => r.sleutel === 'verhuur_autocontract_profielen')?.waarde;
    const profielen = profielData && typeof profielData === 'object' && !Array.isArray(profielData)
      ? profielData as Record<string, unknown> : {};
    const profiel = leesAutocontractProfiel(profielen[soort]);
    if (!profiel) return { voorbereid: false, melding: 'Voor dit verhuurtype zijn nog geen volledige standaardcontractafspraken vastgelegd.' };
    const termijnen = berekenAutocontractTermijnen({
      prijsEuro: tarief.bedrag, profiel, vandaag: ymdInAmsterdam(new Date()), start,
    });
    if (!termijnen.ok) return { voorbereid: false, melding: termijnen.melding };
    const inst = leesInstellingen(instellingen);
    const wizard = wizardUitDossier({
      boekingId: String(input.boekingId), soortLabel: soort,
      activiteit: `${soort} - ${tekst(a.naam)}`,
      naam: tekst(a.naam), email: tekst(a.email), telefoon: tekst(a.telefoon),
      adres: '', straat: tekst(a.straat), huisnummer: tekst(a.huisnummer),
      toevoeging: tekst(a.huisnummer_toevoeging), postcode: tekst(a.postcode),
      woonplaats: tekst(a.woonplaats), periodeVan: start, periodeTot: eind,
      personen: tekst(a.aantal_personen),
      huurprijs: tarief.bedrag.toFixed(2),
      aanbetaling: String(termijnen.termijnen.aanbetaling),
    }, inst);
    Object.assign(wizard, {
      tijdVan: profiel.tijdVan, tijdTot: profiel.tijdTot,
      opbouw: profiel.opbouw, afbouw: profiel.afbouw,
      aanbetalingVerval: termijnen.termijnen.aanbetalingVerval,
      restVerval: termijnen.termijnen.restVerval,
    });
    const ontbreekt = controleerWizard(wizard);
    if (ontbreekt.length > 0) {
      return { voorbereid: false, melding: `Nog te controleren: ${ontbreekt.join(', ')}.` };
    }
    const opgeslagen = await bewaarDefinitiefContract(input.client as unknown as ContractWizardSessie, {
      boekingId: input.boekingId, aanvraagId: input.aanvraagId,
      velden: wizard, actor: input.actor, atomair: true,
    });
    return opgeslagen.ok
      ? { voorbereid: true, melding: 'Het contractpakket is automatisch voorbereid; het bestuur kan nu het tweede Ja/Nee-besluit nemen.' }
      : { voorbereid: false, melding: `Het contract kon niet worden voorbereid: ${opgeslagen.melding}` };
  } catch (error) {
    console.error('Automatische contractvoorbereiding onvolledig:', error);
    return { voorbereid: false, melding: 'Het contract is niet automatisch voorbereid. De reservering staat nog op optie; controleer de gegevens in de bestaande wizard.' };
  }
}
