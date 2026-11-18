/**
 * Bewaart contractversies via de ingelogde sessie.
 * De vlag staat uit: dan wordt de database niet geraakt.
 */

import { documentenflowAan } from '../../platform/documentenflow-vlag.ts';
import { contractmailMagWeg, contractMailDriePdf, maakContractPdf, sha256Hex, tekenUrl } from '../../platform/contract-pakket.ts';
import { maakDrieContractBijlagen } from '../../platform/factuur-van-moment.ts';
import { factuurpakketAan, bekijkFactuurConcept, geefFactuurVoorContract, markeerFactuurVerzonden } from './factuur-sessie.ts';
import { leesContractSjabloon } from '../contract-sjabloon-opslag.ts';
import { hashTekenToken, maakTekenToken } from '../../platform/contract-tekenen.ts';
import {
  betalingStand,
  geldUitAdministratie,
  leesInstellingen,
  voerFlowUit,
  type ContractVersie,
  type ContractVerzending,
  type FlowActie,
  type FlowContext,
  type FlowMail,
  type GeldRegel,
} from '../../platform/documentenflow.ts';
import { adresUitAanvraagOfWizard } from '../../platform/contract-wizard.ts';
import { SOORT_LABEL } from '../../platform/demo-data.ts';
import { ymdInAmsterdam } from '../../platform/datum.ts';
import type { Actor } from './kern.ts';
import { voerDossierViaSessie, type DossierSessie } from './dossier-sessie.ts';
import { promoveerIndienKlaar } from './definitief-auto.ts';
import { noteerGetekendDocument } from './ontvangst.ts';
import { bewaarOnveranderlijkePdf, type PdfBucket } from './onveranderlijke-pdf-opslag.ts';
import { reserveerLiveContractVerzending } from './contract-verzendclaim.ts';
import { contractProviderUitkomstOnzeker } from '../../platform/verzend-onzekerheid.ts';

type Fout = { message: string; code?: string } | null;
type Rij = Record<string, unknown>;

interface Antwoord {
  data: Rij[] | null;
  error: Fout;
}

function tekst(waarde: unknown): string {
  return waarde == null ? '' : String(waarde);
}

function getal(waarde: unknown): number | null {
  if (typeof waarde === 'number' && Number.isFinite(waarde)) return waarde;
  if (typeof waarde === 'string' && waarde.trim() && Number.isFinite(Number(waarde))) return Number(waarde);
  return null;
}

function mistTabel(fout: Fout): boolean {
  return Boolean(fout && /does not exist|schema cache|42P01|contractversies|contract_verzendingen/i.test(`${fout.code ?? ''} ${fout.message}`));
}

async function lees(
  client: DossierSessie,
  tabel: string,
  kolommen: string,
  filter?: { kolom: string; waarde: unknown },
): Promise<{ data: Rij[] } | { fout: string } | { mist: true }> {
  let query = client.from(tabel).select(kolommen);
  if (filter) query = query.eq(filter.kolom, filter.waarde);
  const antwoord = await (query as unknown as Promise<Antwoord>);
  if (antwoord.error) {
    if (mistTabel(antwoord.error)) return { mist: true };
    return { fout: antwoord.error.message };
  }
  return { data: antwoord.data ?? [] };
}

function versieUitRij(rij: Rij, verzendingen: ContractVerzending[]): ContractVersie {
  const afspraken = (rij.afspraken && typeof rij.afspraken === 'object' ? rij.afspraken : {}) as ContractVersie['afspraken'];
  const checks = (rij.checks && typeof rij.checks === 'object' ? rij.checks : {}) as Record<string, boolean>;
  return {
    versie: Number(rij.versie),
    contractnummer: tekst(rij.contractnummer),
    opgesteldOp: tekst(rij.opgesteld_op).slice(0, 10),
    tekst: tekst(rij.tekst),
    voorwaardenTekst: tekst(rij.voorwaarden_tekst),
    huisregelsTekst: tekst(rij.huisregels_tekst),
    plattegrondTekst: tekst(rij.plattegrond_tekst),
    vingerafdruk: tekst(rij.vingerafdruk),
    afspraken: {
      tijdVan: tekst(afspraken.tijdVan),
      tijdTot: tekst(afspraken.tijdTot),
      opbouw: tekst(afspraken.opbouw),
      afbouw: tekst(afspraken.afbouw),
      contactpersoon: tekst(afspraken.contactpersoon),
    },
    bestuurVerplicht: rij.bestuur_verplicht !== false,
    bestuur: (tekst(rij.bestuur) || 'open') as ContractVersie['bestuur'],
    bestuurActor: rij.bestuur_actor == null ? null : tekst(rij.bestuur_actor),
    bestuurOp: rij.bestuur_op == null ? null : tekst(rij.bestuur_op),
    bestuurToelichting: rij.bestuur_toelichting == null ? null : tekst(rij.bestuur_toelichting),
    ondertekening: tekst(rij.ondertekening) === 'ontvangen' ? 'ontvangen' : 'open',
    ondertekeningActor: rij.ondertekening_actor == null ? null : tekst(rij.ondertekening_actor),
    ondertekeningOp: rij.ondertekening_op == null ? null : tekst(rij.ondertekening_op),
    ondertekeningNummer: rij.ondertekening_nummer == null ? null : tekst(rij.ondertekening_nummer),
    ondertekeningVersie: rij.ondertekening_versie == null ? null : Number(rij.ondertekening_versie),
    checks,
    verzendingen: verzendingen.filter((regel) => regel.versie === Number(rij.versie)),
  };
}

function verzendingUitRij(rij: Rij): ContractVerzending {
  return {
    soort: tekst(rij.soort) as ContractVerzending['soort'],
    idempotentie: tekst(rij.idempotentie),
    ontvanger: tekst(rij.ontvanger),
    werkelijk: tekst(rij.werkelijk),
    status: tekst(rij.status) as ContractVerzending['status'],
    berichtId: rij.bericht_id == null ? null : tekst(rij.bericht_id),
    op: tekst(rij.op),
    versie: Number(rij.versie),
    providerStatus: tekst(rij.provider_status) === 'geaccepteerd' ? 'geaccepteerd' : null,
  };
}

function veiligLog(melding: string): string {
  return melding
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[adres]')
    .replace(/\/tekenen\/[A-Za-z0-9_-]{20,}/g, '/tekenen/[token]')
    .replace(/\b[A-Za-z0-9_-]{43,}\b/g, '[token]');
}

function isContractmail(soort: string): boolean {
  return soort === 'contract' || soort === 'proef' || soort === 'herhaling';
}

export interface DossierLading {
  context: Omit<FlowContext, 'nu' | 'vandaag' | 'actorNaam' | 'rechten' | 'modus' | 'testadres'>;
  fout: string;
}

export async function leesDocumentenDossier(
  client: DossierSessie,
  boekingId: string,
  promotieAanwezig?: boolean,
): Promise<{ ok: true; lading: DossierLading } | { ok: false; melding: string }> {
  const id = Number(boekingId);
  if (!Number.isInteger(id)) return { ok: false, melding: 'Deze boeking heeft geen contractdossier.' };
  const boekingen = await lees(
    client,
    'boekingen',
    'id,status,verhuurtype_sleutel,interne_titel,start_datum,eind_datum,huurder_naam_snapshot,huurder_email_snapshot,huurder_telefoon_snapshot,tarief_bedrag,aanbetaling_bedrag,aanbetaling_ontvangen,gastheer_relatie_id,aantal_personen,toelichting,aangemaakt_op,aanvraag_id',
    { kolom: 'id', waarde: id },
  );
  if ('mist' in boekingen) return { ok: false, melding: 'De documentenflow is nog niet gemigreerd.' };
  if ('fout' in boekingen) return { ok: false, melding: boekingen.fout };
  const boeking = boekingen.data[0];
  if (!boeking) return { ok: false, melding: 'De boeking is niet gevonden.' };
  const aanvraagId = getal(boeking.aanvraag_id);
  const aanvragen = aanvraagId == null
    ? { data: [] as Rij[] }
    : await lees(
      client,
      'aanvragen',
      'id,naam,email,telefoon,straat,huisnummer,huisnummer_toevoeging,postcode,woonplaats,verhuurtype_sleutel,toelichting,aantal_personen,website,binnengekomen_op',
      { kolom: 'id', waarde: aanvraagId },
    );
  if ('fout' in aanvragen) return { ok: false, melding: aanvragen.fout };
  if ('mist' in aanvragen) return { ok: false, melding: 'De aanvraaggegevens zijn niet gelezen.' };
  const aanvraag = aanvragen.data[0] ?? {};
  const gastId = getal(boeking.gastheer_relatie_id);
  const gasten = gastId == null
    ? { data: [] as Rij[] }
    : await lees(client, 'relaties', 'id,naam,email,telefoon', { kolom: 'id', waarde: gastId });
  if ('fout' in gasten) return { ok: false, melding: gasten.fout };
  const gast = ('data' in gasten ? gasten.data[0] : null) ?? {};
  const betalingen = await lees(client, 'betalingen', 'soort,bedrag,status,vervaldatum', { kolom: 'boeking_id', waarde: id });
  if ('fout' in betalingen) return { ok: false, melding: betalingen.fout };
  const regels: GeldRegel[] = ('data' in betalingen ? betalingen.data : []).map((rij) => ({
    soort: tekst(rij.soort),
    bedrag: getal(rij.bedrag),
    status: tekst(rij.status),
    vervaldatum: tekst(rij.vervaldatum).slice(0, 10),
  }));
  const instellingRijen = await lees(client, 'instellingen', 'sleutel,waarde');
  if ('fout' in instellingRijen) return { ok: false, melding: instellingRijen.fout };
  const versieRijen = await lees(client, 'contractversies', '*', { kolom: 'boeking_id', waarde: id });
  if ('mist' in versieRijen) return { ok: false, melding: 'De documentenflow is nog niet gemigreerd.' };
  if ('fout' in versieRijen) return { ok: false, melding: versieRijen.fout };
  const verzendRijen = await lees(client, 'contract_verzendingen', '*', { kolom: 'boeking_id', waarde: id });
  if ('mist' in verzendRijen) return { ok: false, melding: 'De documentenflow is nog niet gemigreerd.' };
  if ('fout' in verzendRijen) return { ok: false, melding: verzendRijen.fout };
  const verzendingen = verzendRijen.data.map(verzendingUitRij);
  const laatsteVersie = versieRijen.data.reduce<Rij | null>((gek, rij) => {
    if (!gek || Number(rij.versie) > Number(gek.versie)) return rij;
    return gek;
  }, null);
  const wizard = laatsteVersie && laatsteVersie.afspraken && typeof laatsteVersie.afspraken === 'object'
    ? (laatsteVersie.afspraken as { wizard?: unknown }).wizard
    : null;
  const adres = adresUitAanvraagOfWizard({
    straat: tekst(aanvraag.straat),
    huisnummer: tekst(aanvraag.huisnummer),
    toevoeging: tekst(aanvraag.huisnummer_toevoeging),
    postcode: tekst(aanvraag.postcode),
    woonplaats: tekst(aanvraag.woonplaats),
  }, wizard);
  const geld = geldUitAdministratie({
    huurprijs: getal(boeking.tarief_bedrag),
    aanbetaling: getal(boeking.aanbetaling_bedrag),
    regels,
  });
  const soort = tekst(boeking.verhuurtype_sleutel || aanvraag.verhuurtype_sleutel);
  const geboekt = tekst(aanvraag.binnengekomen_op || boeking.aangemaakt_op).slice(0, 10);
  return {
    ok: true,
    lading: {
      fout: '',
      context: {
        instellingen: leesInstellingen('data' in instellingRijen ? instellingRijen.data.map((rij) => ({ sleutel: tekst(rij.sleutel), waarde: rij.waarde })) : []),
        versies: versieRijen.data.map((rij) => versieUitRij(rij, verzendingen)),
        betaling: betalingStand({ vlag: boeking.aanbetaling_ontvangen === true, regels }),
        bron: {
          boekingId: String(id),
          soort,
          soortLabel: SOORT_LABEL[soort] ?? soort,
          activiteit: tekst(boeking.interne_titel || aanvraag.naam),
          toelichting: tekst(boeking.toelichting || aanvraag.toelichting),
          periodeVan: tekst(boeking.start_datum),
          periodeTot: tekst(boeking.eind_datum),
          geboektOp: geboekt,
          huurderNaam: tekst(boeking.huurder_naam_snapshot || aanvraag.naam),
          straat: adres.straat,
          huisnummer: adres.huisnummer,
          toevoeging: adres.toevoeging,
          postcode: adres.postcode,
          woonplaats: adres.woonplaats,
          email: tekst(boeking.huurder_email_snapshot || aanvraag.email),
          telefoon: tekst(boeking.huurder_telefoon_snapshot || aanvraag.telefoon),
          personen: tekst(boeking.aantal_personen || aanvraag.aantal_personen),
          huurprijsCent: geld.huurprijsCent,
          aanbetalingCent: geld.aanbetalingCent,
          aanbetalingVerval: geld.aanbetalingVerval,
          restCent: geld.restCent,
          restVerval: geld.restVerval,
          gastNaam: tekst(gast.naam),
          gastEmail: tekst(gast.email),
          gastTelefoon: tekst(gast.telefoon),
          promotieAanwezig: promotieAanwezig ?? Boolean(tekst(aanvraag.website).trim()),
          boekingStatus: tekst(boeking.status),
        },
      },
    },
  };
}

async function bewaarVersies(client: DossierSessie, boekingId: number, vorige: readonly ContractVersie[], versies: readonly ContractVersie[]): Promise<string | null> {
  const bekend = new Map(vorige.map((versie) => [versie.versie, versie]));
  for (const versie of versies) {
    const oud = bekend.get(versie.versie);
    if (!oud) {
      const insert = await client.from('contractversies').insert({
        boeking_id: boekingId,
        versie: versie.versie,
        contractnummer: versie.contractnummer,
        opgesteld_op: versie.opgesteldOp,
        tekst: versie.tekst,
        voorwaarden_tekst: versie.voorwaardenTekst,
        huisregels_tekst: versie.huisregelsTekst,
        plattegrond_tekst: versie.plattegrondTekst,
        vingerafdruk: versie.vingerafdruk,
        afspraken: versie.afspraken,
        bestuur_verplicht: versie.bestuurVerplicht,
        bestuur: versie.bestuur,
        checks: versie.checks,
        ondertekening: versie.ondertekening,
      }).select('versie').maybeSingle();
      if (insert.error) return insert.error.message;
      if (Number(insert.data?.versie) !== versie.versie) {
        return 'De nieuwe contractversie kon niet worden bevestigd. Controleer het dossier voordat je verdergaat.';
      }
      continue;
    }
    if (oud.tekst !== versie.tekst || oud.voorwaardenTekst !== versie.voorwaardenTekst || oud.huisregelsTekst !== versie.huisregelsTekst) {
      return 'Een vastgelegde contractversie zou veranderen. Er is niets opgeslagen.';
    }
    // Een verzendactie verandert geen contractversie. Schrijf in dat geval
    // niets terug: oude snapshots mogen een nieuw bestuursbesluit niet wissen.
    if (oud.bestuur === versie.bestuur
      && oud.bestuurActor === versie.bestuurActor
      && oud.bestuurOp === versie.bestuurOp
      && oud.bestuurToelichting === versie.bestuurToelichting
      && oud.ondertekening === versie.ondertekening
      && oud.ondertekeningActor === versie.ondertekeningActor
      && oud.ondertekeningOp === versie.ondertekeningOp
      && oud.ondertekeningNummer === versie.ondertekeningNummer
      && oud.ondertekeningVersie === versie.ondertekeningVersie
      && JSON.stringify(oud.checks) === JSON.stringify(versie.checks)) continue;
    // Voorkom dat twee bestuursbesluiten over een oude status elkaar overschrijven.
    let update = client.from('contractversies').update({
      bestuur: versie.bestuur,
      bestuur_actor: versie.bestuurActor,
      bestuur_op: versie.bestuurOp,
      bestuur_toelichting: versie.bestuurToelichting,
      ondertekening: versie.ondertekening,
      ondertekening_actor: versie.ondertekeningActor,
      ondertekening_op: versie.ondertekeningOp,
      ondertekening_nummer: versie.ondertekeningNummer,
      ondertekening_versie: versie.ondertekeningVersie,
      checks: versie.checks,
    }).eq('boeking_id', boekingId).eq('versie', versie.versie);
    if (oud.bestuur !== versie.bestuur) update = update.eq('bestuur', oud.bestuur);
    const antwoord = await update.select('id').maybeSingle();
    if (antwoord.error) return antwoord.error.message;
    if (!antwoord.data?.id) return 'De contractversie is intussen aangepast. Vernieuw het dossier voordat je een nieuw besluit neemt.';
  }
  return null;
}

async function bewaarTekenlink(
  client: DossierSessie,
  boekingId: number,
  versie: number,
  email: string,
): Promise<{ ok: true; link: string; verloopt: string } | { ok: false; melding: string }> {
  const token = maakTekenToken();
  const tokenHash = hashTekenToken(token);
  const verloopt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const bestaand = await client.from('contract_tekeningen').select('ondertekend_op').eq('boeking_id', boekingId).eq('versie', versie).maybeSingle();
  if (bestaand.error && !/schema cache|does not exist|42P01/i.test(bestaand.error.message)) {
    return { ok: false, melding: 'De tekenlink is niet opgeslagen. Er is geen mail verstuurd.' };
  }
  if (bestaand.error) return { ok: false, melding: 'De contractmigratie is nog niet uitgevoerd. Er is geen mail verstuurd.' };
  if (bestaand.data && tekst(bestaand.data.ondertekend_op)) {
    return { ok: false, melding: 'Deze versie is al ondertekend. Er is geen nieuwe link gemaakt en geen mail verstuurd.' };
  }
  const rij = {
    token_hash: tokenHash,
    verloopt_op: verloopt,
    email,
    vrijgegeven: false,
  };
  const antwoord = bestaand.data
    ? await client.from('contract_tekeningen').update(rij).eq('boeking_id', boekingId).eq('versie', versie)
    : await client.from('contract_tekeningen').insert({ ...rij, boeking_id: boekingId, versie });
  const fout = 'error' in antwoord ? antwoord.error : null;
  if (fout) return { ok: false, melding: 'De tekenlink is niet opgeslagen. Er is geen mail verstuurd.' };
  return { ok: true, link: tekenUrl(token), verloopt };
}

export async function pasDocumentenflowToe(input: {
  client: DossierSessie | null;
  env: Record<string, unknown>;
  actor: Actor;
  boekingId: string;
  actie: FlowActie;
  verwachteVersie?: number;
  promotieAanwezig?: boolean;
  modus: 'uit' | 'test' | 'aan';
  testadres: string | null;
  bestand?: { naam: string; bytes: Uint8Array } | null;
  verstuur: (mail: FlowMail) => Promise<{ verzonden: boolean; berichtId: string | null; melding: string; providerAangeroepen?: boolean }>;
}): Promise<{ ok: boolean; melding: string }> {
  const extraMail = input.actie.soort === 'praktisch' || input.actie.soort === 'promotie';
  if (extraMail && !documentenflowAan(input.env)) return { ok: false, melding: 'Documentenflow staat uit. Er is niets gewijzigd.' };
  if (!input.client) return { ok: false, melding: 'Voorbeeld. Er is niets opgeslagen en er is geen mail verstuurd.' };
  const gelezen = await leesDocumentenDossier(input.client, input.boekingId, input.promotieAanwezig);
  if (!gelezen.ok) return gelezen;
  // Na een preview mag niet per ongeluk een nieuwer, niet beoordeeld contract
  // worden goedgekeurd of verstuurd door een gelijktijdige versieaanpassing.
  if (input.verwachteVersie != null) {
    const nieuwste = gelezen.lading.context.versies.reduce((nr, v) => Math.max(nr, v.versie), 0);
    if (nieuwste !== input.verwachteVersie) {
      return { ok: false, melding: 'Het contract is intussen gewijzigd. Bekijk eerst de nieuwe versie; er is niets gewijzigd of verzonden.' };
    }
  }
  if (input.bestand && input.actie.soort === 'ondertekend') {
    if (input.bestand.bytes.byteLength > 8_000_000 || !tekstVanBytes(input.bestand.bytes).startsWith('%PDF')) {
      return { ok: false, melding: 'Het bestand is geen PDF. Er is niets vastgelegd.' };
    }
    const pad = `contracten/${input.boekingId}/getekend-v${input.actie.versie}.pdf`;
    const opslag = input.client as DossierSessie & {
      storage?: { from(bucket: string): PdfBucket };
    };
    if (!opslag.storage?.from) return { ok: false, melding: 'Het bestand is niet opgeslagen. De ontvangst is niet vastgelegd.' };
    const upload = await opslag.storage.from('booking-documents').upload(pad, input.bestand.bytes, { contentType: 'application/pdf', upsert: false });
    if (upload.error) return { ok: false, melding: 'Het bestand is niet opgeslagen. De ontvangst is niet vastgelegd.' };
    const document = await input.client.from('documenten').insert({
      boeking_id: Number(input.boekingId),
      type: 'getekend_contract',
      bestandsnaam: input.bestand.naam.replace(/[^\w.\- ]+/g, '').slice(0, 120) || 'getekend.pdf',
      storage_pad: pad,
      mime_type: 'application/pdf',
      grootte_bytes: input.bestand.bytes.byteLength,
    }).select('id').maybeSingle();
    if (document.error) return { ok: false, melding: 'Het bestand is niet in het dossier gezet. De ontvangst is niet vastgelegd.' };
  }
  const context: FlowContext = {
    ...gelezen.lading.context,
    nu: new Date().toISOString(),
    vandaag: ymdInAmsterdam(new Date()),
    actorNaam: input.actor.naam,
    rechten: input.actor.rechten ?? { isSuperAdmin: false, perModule: {} },
    modus: input.modus,
    testadres: input.testadres,
  };
  const plan = voerFlowUit(input.actie, context);
  if (!plan.ok) return plan;
  // Ook de bestaande handmatige verzendknop mag na het activeren van V4
  // niet terugvallen op de oude mail met slechts één PDF.
  if (plan.mail?.teltAlsVerzonden &&
      (input.env.V4_ATOMAIR_CONTRACT === 'true' || input.env.V4_AUTOCONTRACT === 'true') &&
      !factuurpakketAan(input.env)) {
    return { ok: false, melding: 'Het driedelige contractpakket is niet ingeschakeld. Er is niets verstuurd.' };
  }
  const fout = await bewaarVersies(input.client, Number(input.boekingId), context.versies, plan.versies);
  if (fout) return { ok: false, melding: fout };
  if (input.actie.soort === 'akkoord' || input.actie.soort === 'ondertekend' || input.actie.soort === 'gereed') {
    await promoveerIndienKlaar(input.client, Number(input.boekingId), input.actor);
  }
  if (plan.promoveer) {
    const gezet = await voerDossierViaSessie(input.client, {
      soort: 'handmatig_definitief',
      boekingId: input.boekingId,
      reden: `Vastgestelde regel: ${context.instellingen.gereedRegel}`,
    }, input.actor);
    if (!gezet.ok) return gezet;
  }
  let manifest: { bestandsnaam: string; bytes: number; sha256: string; mime: 'application/pdf' }[] = [];
  let pakket: ReturnType<typeof maakContractPdf> | null = null;
  let pakketVersie: ContractVersie | null = null;
  const driePdf = factuurpakketAan(input.env);
  let factuurId: number | null = null;
  let factuurEerderVerzonden = false;
  let factuurPad: string | null = null;
  let factuurSha: string | null = null;
  if (plan.mail && isContractmail(plan.mail.soort)) {
    pakketVersie = plan.versies.find((item) => item.versie === plan.mail?.versie) ?? context.versies.at(-1) ?? null;
    if (!pakketVersie) return { ok: false, melding: 'De contractversie ontbreekt. Er is geen mail verstuurd.' };
    const sjabloon = await leesContractSjabloon();
    if (sjabloon.fout) return { ok: false, melding: sjabloon.fout };
    pakket = await maakContractPdf(
      {
        tekst: pakketVersie.tekst,
        voorwaardenTekst: pakketVersie.voorwaardenTekst,
        huisregelsTekst: pakketVersie.huisregelsTekst,
        plattegrondTekst: pakketVersie.plattegrondTekst,
        soort: context.bron.soort,
      },
      `${pakketVersie.contractnummer}.pdf`,
      pakketVersie.contractnummer,
      sjabloon.bytes,
    );
    if (!pakket.ok) return pakket;
  }
  async function zetStatus(idempotentie: string, status: 'verzonden' | 'geweigerd', berichtId: string | null): Promise<boolean> {
    const volledig = await input.client!.from('contract_verzendingen').update({
      status,
      bericht_id: berichtId,
      provider_status: status === 'verzonden' ? 'geaccepteerd' : null,
      bijlagen: manifest,
    }).eq('idempotentie', idempotentie).select('id').maybeSingle();
    if (!volledig.error && volledig.data?.id) return true;
    // Oudere migraties kunnen de aanvullende kolommen missen. De basismutatie
    // is alleen geslaagd als exact een bestaande verzendrij is teruggegeven.
    const minimaal = await input.client!.from('contract_verzendingen').update({
      status,
      bericht_id: berichtId,
    }).eq('idempotentie', idempotentie).select('id').maybeSingle();
    return !minimaal.error && Boolean(minimaal.data?.id);
  }
  if (plan.mail) {
    // Nieuwe live pakketten krijgen een boekingslock via een Supabase-RPC;
    // de gewone INSERT alleen voor de bestaande proef-/legacyverzendingen.
    // Bij een ontbrekende RPC is dit fail-closed: er gaat geen mail uit.
    const livePakket = driePdf && (plan.mail.soort === 'contract' || plan.mail.soort === 'herhaling');
    const claim = livePakket
      ? await (async () => {
          const resultaat = await reserveerLiveContractVerzending(input.client, {
            boekingId: Number(input.boekingId),
            versie: plan.mail!.versie,
            soort: plan.mail!.soort as 'contract' | 'herhaling',
            idempotentie: plan.mail!.idempotentie,
            ontvanger: plan.mail!.bedoelde,
            werkelijk: plan.mail!.naar,
          });
          return resultaat.ok
            ? { data: { id: resultaat.id }, error: null }
            : { data: null, error: { message: resultaat.melding } };
        })()
      : await input.client.from('contract_verzendingen').insert({
          boeking_id: Number(input.boekingId),
          versie: plan.mail.versie,
          soort: plan.mail.soort,
          idempotentie: plan.mail.idempotentie,
          ontvanger: plan.mail.bedoelde,
          werkelijk: plan.mail.naar,
          status: 'bezig',
        }).select('id').maybeSingle();
    if (claim.error) {
      if (claim.error.code === '23505') {
        // Een unieke sleutel kan ook botsen met een nog lopende verzending.
        // Dat is GEEN succes; anders ziet het bestuur een onjuiste bevestiging.
        const bestaand = await input.client.from('contract_verzendingen')
          .select('status,bericht_id,idempotentie,soort')
          .eq('boeking_id', Number(input.boekingId))
          .eq('versie', plan.mail.versie);
        if (bestaand.error) return { ok: false, melding: 'De verzendstatus kon niet worden vastgesteld. Er is geen nieuwe mail gestart.' };
        const dezelfde = (bestaand.data ?? []).find((rij) => rij.idempotentie === plan.mail?.idempotentie);
        const geaccepteerd = (bestaand.data ?? []).some((rij) =>
          (rij.soort === 'contract' || rij.soort === 'herhaling') && rij.status === 'verzonden' && Boolean(rij.bericht_id));
        if (geaccepteerd) return { ok: true, melding: 'Dit contract is eerder door de mailprovider geaccepteerd. Er is niet opnieuw gemaild.' };
        if (dezelfde?.status === 'geweigerd') {
          return { ok: false, melding: 'De vorige verzendpoging is mislukt. Vernieuw het dossier en probeer opnieuw via Contractverzending hervatten.' };
        }
        return { ok: false, melding: 'Een contractverzending is al in behandeling. Er is geen tweede mail gestart. Controleer eerst de verzendstatus.' };
      }
      return { ok: false, melding: claim.error.message };
    }
    if (!claim.data?.id) {
      // Een INSERT zonder leesbare bevestiging bewijst niet dat de unieke
      // verzendclaim is vastgelegd. De provider mag dan nooit worden benaderd.
      return { ok: false, melding: 'De verzendclaim kon niet worden bevestigd. Er is geen mail verstuurd; controleer het dossier.' };
    }
    if (pakket?.ok && pakketVersie) {
      const link = await bewaarTekenlink(input.client, Number(input.boekingId), pakketVersie.versie, context.bron.email);
      if (!link.ok) {
        await zetStatus(plan.mail.idempotentie, 'geweigerd', null);
        return link;
      }
      const contextMetLink: FlowContext = { ...context, tekenLink: link.link, tekenVerloopt: link.verloopt };
      const opnieuw = voerFlowUit(input.actie, contextMetLink);
      if (!opnieuw.ok || !opnieuw.mail) {
        await zetStatus(plan.mail.idempotentie, 'geweigerd', null);
        return { ok: false, melding: opnieuw.ok ? 'Er is geen mail verstuurd.' : opnieuw.melding };
      }
      plan.mail = opnieuw.mail;
      const bron = {
        tekst: pakketVersie.tekst,
        voorwaardenTekst: pakketVersie.voorwaardenTekst,
        huisregelsTekst: pakketVersie.huisregelsTekst,
        plattegrondTekst: pakketVersie.plattegrondTekst,
        soort: context.bron.soort,
      };
      let bijlagen = [pakket.bijlage];
      if (driePdf) {
        const factuurResultaat = plan.mail.soort === 'proef'
          ? await bekijkFactuurConcept(input.client, context, pakketVersie)
          : await geefFactuurVoorContract(input.client, context, pakketVersie);
        if (!factuurResultaat.ok) {
          await zetStatus(plan.mail.idempotentie, 'geweigerd', null);
          return factuurResultaat;
        }
        factuurId = factuurResultaat.id;
        factuurEerderVerzonden = factuurResultaat.eerderVerzonden === true;
        if (factuurEerderVerzonden && plan.mail.soort === 'contract') {
          await zetStatus(plan.mail.idempotentie, 'geweigerd', null);
          return { ok: false, melding: 'De factuur bij deze contractversie is al eerder verzonden. Controleer de verzending; niet opnieuw als eerste contractmail versturen.' };
        }
        try {
          bijlagen = [...maakDrieContractBijlagen(bron, pakketVersie.contractnummer, factuurResultaat.factuur, plan.mail.soort === 'proef')];
        } catch (error) {
          await zetStatus(plan.mail.idempotentie, 'geweigerd', null);
          return { ok: false, melding: error instanceof Error ? error.message : 'De PDF-bijlagen zijn ongeldig.' };
        }
        const brief = contractMailDriePdf({
          naam: context.bron.huurderNaam,
          contractnummer: pakketVersie.contractnummer,
          versie: pakketVersie.versie,
          link: link.link,
          verlooptOp: link.verloopt,
        });
        plan.mail.onderwerp = brief.onderwerp;
        plan.mail.tekst = brief.tekst;
        plan.mail.html = brief.html;
        if (factuurId != null) {
          factuurPad = `facturen/${input.boekingId}/${factuurResultaat.factuur.factuurnummer}.pdf`;
          factuurSha = sha256Hex(bijlagen[2].inhoud);
        }
      }
      plan.mail.bijlagen = bijlagen.map((bestand) => ({
        bestandsnaam: bestand.bestandsnaam,
        tekst: '',
        bytes: bestand.inhoud,
      }));
      const blokkade = contractmailMagWeg({
        tekst: plan.mail.tekst,
        link: link.link,
        bijlagen,
        contractnummer: pakketVersie.contractnummer,
        pakketDrie: driePdf,
      });
      if (blokkade) {
        await zetStatus(plan.mail.idempotentie, 'geweigerd', null);
        return { ok: false, melding: blokkade };
      }
      const pad = `contracten/${input.boekingId}/pakket-v${pakketVersie.versie}.pdf`;
      const opslag = input.client as DossierSessie & {
        storage?: { from(bucket: string): PdfBucket };
      };
      if (!opslag.storage?.from) {
        await zetStatus(plan.mail.idempotentie, 'geweigerd', null);
        return { ok: false, melding: 'De documentopslag is niet bereikbaar. Er is geen mail verstuurd.' };
      }
      const stukken = [{ pad, inhoud: pakket.bijlage.inhoud }, ...(
        driePdf ? bijlagen.map((bestand, i) => ({
          pad: i === 0 ? `contracten/${input.boekingId}/overeenkomst-v${pakketVersie!.versie}.pdf`
            : i === 1 ? `contracten/${input.boekingId}/voorwaarden-v${pakketVersie!.versie}.pdf`
              : factuurPad ?? `contracten/${input.boekingId}/proef-factuur-v${pakketVersie!.versie}.pdf`,
          inhoud: bestand.inhoud,
        })) : [])];
      const bucket = opslag.storage.from('booking-documents');
      for (const stuk of stukken) {
        const upload = await bewaarOnveranderlijkePdf(bucket, stuk.pad, stuk.inhoud);
        if (!upload.ok) {
          await zetStatus(plan.mail.idempotentie, 'geweigerd', null);
          return { ok: false, melding: `${upload.melding} (${stuk.pad}). Er is geen mail verstuurd.` };
        }
      }
      manifest = driePdf
        ? bijlagen.map((bestand) => ({ bestandsnaam: bestand.bestandsnaam, bytes: bestand.inhoud.byteLength,
          sha256: sha256Hex(bestand.inhoud), mime: 'application/pdf' as const }))
        : [pakket.manifest];
    }
    let uit: { verzonden: boolean; berichtId: string | null; melding: string; providerAangeroepen?: boolean };
    let providerOnbekend = false;
    try {
      uit = await input.verstuur(plan.mail);
    } catch (error) {
      providerOnbekend = true;
      uit = { verzonden: false, berichtId: null, melding: veiligLog(error instanceof Error ? error.message : 'Verzenden mislukt.') };
    }
    if (uit.verzonden && !uit.berichtId) {
      return { ok: false, melding: 'De mailprovider gaf geen mail-ID. De verzending blijft bezig en is niet opnieuw gestart.' };
    }
    // Bij een time-out kan de provider het bericht al hebben geaccepteerd.
    // De claim blijft bewust 'bezig' totdat het providerbericht gecontroleerd is.
    // 'geweigerd' zou een latere dubbele verzending mogelijk maken.
    if (contractProviderUitkomstOnzeker({ livePakket, providerWierpFout: providerOnbekend, verzonden: uit.verzonden, providerAangeroepen: uit.providerAangeroepen })) {
      return { ok: false, melding: 'De providerstatus is onzeker. Er wordt niet automatisch opnieuw verstuurd. Controleer de verzendclaim en Resend voordat deze wordt vrijgegeven.' };
    }
    const geaccepteerd = uit.verzonden && Boolean(uit.berichtId);
    const statusVastgelegd = await zetStatus(plan.mail.idempotentie, geaccepteerd ? 'verzonden' : 'geweigerd', geaccepteerd ? uit.berichtId : null);
    if (!statusVastgelegd) {
      // De provider kan de mail al hebben afgeleverd. Geef de tekenlink alsnog
      // vrij als dat veilig kan; blijf de ontbrekende verzendregistratie tonen
      // als handmatig te herstellen incident. Er mag nooit blind opnieuw uit.
      if (geaccepteerd && (plan.mail.soort === 'contract' || plan.mail.soort === 'herhaling')) {
        await input.client.from('contract_tekeningen').update({ vrijgegeven: true })
          .eq('boeking_id', Number(input.boekingId)).eq('versie', plan.mail.versie);
      }
      return { ok: false, melding: geaccepteerd
        ? 'De mailprovider heeft het contract geaccepteerd, maar registratie van de verzendstatus is mislukt. Niet opnieuw verzenden: controleer de provider en het dossier handmatig.'
        : 'De mailstatus kon niet worden vastgelegd. Controleer de verzendpoging voordat je opnieuw verzendt.' };
    }
    // Na acceptatie door de mailprovider eerst de tekenlink vrijgeven. Ook als
    // een latere administratieve registratie faalt, moet de reeds ontvangen
    // mail bruikbaar blijven; de mail mag niet opnieuw worden verstuurd.
    if (geaccepteerd && (plan.mail.soort === 'contract' || plan.mail.soort === 'herhaling')) {
      const vrijgave = await input.client.from('contract_tekeningen').update({ vrijgegeven: true }).eq('boeking_id', Number(input.boekingId)).eq('versie', plan.mail.versie);
      if (vrijgave.error) return { ok: false, melding: 'Contract is geaccepteerd door de mailprovider, maar de ondertekenlink kon niet worden vrijgegeven. Controleer het dossier; niet opnieuw mailen.' };
    }
    if (!geaccepteerd) {
      await input.client.from('contract_tekeningen').update({ verloopt_op: new Date().toISOString(), vrijgegeven: false }).eq('boeking_id', Number(input.boekingId)).eq('versie', plan.mail.versie);
      return { ok: false, melding: uit.melding || 'De mailprovider heeft de mail niet geaccepteerd. Er is niets als verzonden genoteerd.' };
    }
    if (factuurId != null && factuurPad && factuurSha && !factuurEerderVerzonden) {
      const genoteerd = await markeerFactuurVerzonden(input.client, factuurId, uit.berichtId!, factuurPad, factuurSha);
      if (!genoteerd) return { ok: false, melding: 'De mailprovider heeft de factuur geaccepteerd, maar de factuurregistratie is niet afgerond. Niet opnieuw verzenden; controleer het dossier.' };
    }
    // Een herhalingsmail is geen nieuwe contractuitgifte en maakt geen
    // dubbele documentrijen aan. De eerdere factuur en PDF blijven leidend.
    if (plan.mail.soort === 'contract') {
      await input.client.from('documenten').insert({
        boeking_id: Number(input.boekingId),
        type: 'contract',
        bestandsnaam: pakket?.ok ? pakket.manifest.bestandsnaam : `${plan.mail.versie}.pdf`,
        storage_pad: `contracten/${input.boekingId}/pakket-v${plan.mail.versie}.pdf`,
        mime_type: 'application/pdf',
        grootte_bytes: pakket?.ok ? pakket.manifest.bytes : null,
      });
      if (driePdf && factuurId != null && factuurPad && manifest.length === 3) {
        await input.client.from('documenten').insert({
          boeking_id: Number(input.boekingId), type: 'factuur', bestandsnaam: manifest[2].bestandsnaam,
          storage_pad: factuurPad, mime_type: 'application/pdf', grootte_bytes: manifest[2].bytes,
          merge_velden: { factuur_id: factuurId, versie: plan.mail.versie },
        });
      }
    }
  }
  if (input.actie.soort === 'ondertekend' && !input.bestand) {
    const bewijs = await noteerGetekendDocument(input.client, Number(input.boekingId), null);
    if (bewijs) return { ok: false, melding: bewijs };
  }
  await input.client.from('auditlog').insert({
    actor_naam: input.actor.naam,
    actor_type: input.actor.type,
    onderwerp_type: 'boeking',
    onderwerp_id: input.boekingId,
    actie: `documentenflow_${input.actie.soort}`,
    reden: plan.melding,
    dedup_sleutel: `documentenflow:${input.boekingId}:${input.actie.soort}:${plan.melding}`.slice(0, 180),
  });
  return { ok: true, melding: plan.melding };
}

function tekstVanBytes(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes.slice(0, 5));
}
