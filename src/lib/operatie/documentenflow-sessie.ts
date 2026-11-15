/**
 * Bewaart contractversies via de ingelogde sessie.
 * De vlag staat uit: dan wordt de database niet geraakt.
 */

import { documentenflowAan } from '../../platform/documentenflow-vlag.ts';
import { contractmailMagWeg, maakContractPdf, tekenUrl } from '../../platform/contract-pakket.ts';
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
import { SOORT_LABEL } from '../../platform/demo-data.ts';
import { ymdInAmsterdam } from '../../platform/datum.ts';
import type { Actor } from './kern.ts';
import { voerDossierViaSessie, type DossierSessie } from './dossier-sessie.ts';

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
          straat: tekst(aanvraag.straat),
          huisnummer: tekst(aanvraag.huisnummer),
          toevoeging: tekst(aanvraag.huisnummer_toevoeging),
          postcode: tekst(aanvraag.postcode),
          woonplaats: tekst(aanvraag.woonplaats),
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
      continue;
    }
    if (oud.tekst !== versie.tekst || oud.voorwaardenTekst !== versie.voorwaardenTekst || oud.huisregelsTekst !== versie.huisregelsTekst) {
      return 'Een vastgelegde contractversie zou veranderen. Er is niets opgeslagen.';
    }
    const update = await client.from('contractversies').update({
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
    const antwoord = await (update as unknown as Promise<Antwoord>);
    if (antwoord.error) return antwoord.error.message;
  }
  return null;
}

async function bewaarTekenlink(
  client: DossierSessie,
  boekingId: number,
  versie: number,
  email: string,
): Promise<{ ok: true; link: string } | { ok: false; melding: string }> {
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
  return { ok: true, link: tekenUrl(token) };
}

export async function pasDocumentenflowToe(input: {
  client: DossierSessie | null;
  env: Record<string, unknown>;
  actor: Actor;
  boekingId: string;
  actie: FlowActie;
  promotieAanwezig?: boolean;
  modus: 'uit' | 'test' | 'aan';
  testadres: string | null;
  bestand?: { naam: string; bytes: Uint8Array } | null;
  verstuur: (mail: FlowMail) => Promise<{ verzonden: boolean; berichtId: string | null; melding: string }>;
}): Promise<{ ok: boolean; melding: string }> {
  const extraMail = input.actie.soort === 'praktisch' || input.actie.soort === 'promotie';
  if (extraMail && !documentenflowAan(input.env)) return { ok: false, melding: 'Documentenflow staat uit. Er is niets gewijzigd.' };
  if (!input.client) return { ok: false, melding: 'Voorbeeld. Er is niets opgeslagen en er is geen mail verstuurd.' };
  const gelezen = await leesDocumentenDossier(input.client, input.boekingId, input.promotieAanwezig);
  if (!gelezen.ok) return gelezen;
  if (input.bestand && input.actie.soort === 'ondertekend') {
    if (input.bestand.bytes.byteLength > 8_000_000 || !tekstVanBytes(input.bestand.bytes).startsWith('%PDF')) {
      return { ok: false, melding: 'Het bestand is geen PDF. Er is niets vastgelegd.' };
    }
    const pad = `contracten/${input.boekingId}/getekend-v${input.actie.versie}.pdf`;
    const opslag = input.client as DossierSessie & {
      storage?: { from(bucket: string): { upload(pad: string, body: Uint8Array, opties: { contentType: string; upsert: boolean }): Promise<{ error: { message: string } | null }> } };
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
  const fout = await bewaarVersies(input.client, Number(input.boekingId), context.versies, plan.versies);
  if (fout) return { ok: false, melding: fout };
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
  if (plan.mail && isContractmail(plan.mail.soort)) {
    pakketVersie = plan.versies.find((item) => item.versie === plan.mail?.versie) ?? context.versies.at(-1) ?? null;
    if (!pakketVersie) return { ok: false, melding: 'De contractversie ontbreekt. Er is geen mail verstuurd.' };
    pakket = maakContractPdf(
      {
        tekst: pakketVersie.tekst,
        voorwaardenTekst: pakketVersie.voorwaardenTekst,
        huisregelsTekst: pakketVersie.huisregelsTekst,
        plattegrondTekst: pakketVersie.plattegrondTekst,
        soort: context.bron.soort,
      },
      `${pakketVersie.contractnummer}.pdf`,
      pakketVersie.contractnummer,
    );
    if (!pakket.ok) return pakket;
  }
  async function zetStatus(idempotentie: string, status: 'verzonden' | 'geweigerd', berichtId: string | null) {
    const volledig = await input.client!.from('contract_verzendingen').update({
      status,
      bericht_id: berichtId,
      provider_status: status === 'verzonden' ? 'geaccepteerd' : null,
      bijlagen: manifest,
    }).eq('idempotentie', idempotentie);
    if (volledig.error) {
      await input.client!.from('contract_verzendingen').update({
        status,
        bericht_id: berichtId,
      }).eq('idempotentie', idempotentie);
    }
  }
  if (plan.mail) {
    const claim = await input.client.from('contract_verzendingen').insert({
      boeking_id: Number(input.boekingId),
      versie: plan.mail.versie,
      soort: plan.mail.soort,
      idempotentie: plan.mail.idempotentie,
      ontvanger: plan.mail.bedoelde,
      werkelijk: plan.mail.naar,
      status: 'bezig',
    }).select('id').maybeSingle();
    if (claim.error) {
      if (claim.error.code === '23505') return { ok: true, melding: 'Deze verzending bestaat al. Er is niet opnieuw gemaild.' };
      return { ok: false, melding: claim.error.message };
    }
    if (pakket?.ok && pakketVersie) {
      const link = await bewaarTekenlink(input.client, Number(input.boekingId), pakketVersie.versie, context.bron.email);
      if (!link.ok) {
        await zetStatus(plan.mail.idempotentie, 'geweigerd', null);
        return link;
      }
      const contextMetLink: FlowContext = { ...context, tekenLink: link.link };
      const opnieuw = voerFlowUit(input.actie, contextMetLink);
      if (!opnieuw.ok || !opnieuw.mail) {
        await zetStatus(plan.mail.idempotentie, 'geweigerd', null);
        return { ok: false, melding: opnieuw.ok ? 'Er is geen mail verstuurd.' : opnieuw.melding };
      }
      plan.mail = opnieuw.mail;
      plan.mail.bijlagen = [{
        bestandsnaam: pakket.bijlage.bestandsnaam,
        tekst: plan.mail.bijlagen[0]?.tekst ?? '',
        bytes: pakket.bijlage.inhoud,
      }];
      const blokkade = contractmailMagWeg({
        tekst: plan.mail.tekst,
        link: link.link,
        bijlagen: [{ bestandsnaam: pakket.bijlage.bestandsnaam, inhoud: pakket.bijlage.inhoud }],
        contractnummer: pakketVersie.contractnummer,
      });
      if (blokkade) {
        await zetStatus(plan.mail.idempotentie, 'geweigerd', null);
        return { ok: false, melding: blokkade };
      }
      const pad = `contracten/${input.boekingId}/pakket-v${pakketVersie.versie}.pdf`;
      const opslag = input.client as DossierSessie & {
        storage?: { from(bucket: string): { upload(pad: string, body: Uint8Array, opties: { contentType: string; upsert: boolean }): Promise<{ error: { message: string } | null }> } };
      };
      if (!opslag.storage?.from) {
        await zetStatus(plan.mail.idempotentie, 'geweigerd', null);
        return { ok: false, melding: 'Het PDF-bestand is niet opgeslagen. Er is geen mail verstuurd.' };
      }
      const upload = await opslag.storage.from('booking-documents').upload(pad, pakket.bijlage.inhoud, { contentType: 'application/pdf', upsert: true });
      if (upload.error) {
        await zetStatus(plan.mail.idempotentie, 'geweigerd', null);
        return { ok: false, melding: 'Het PDF-bestand is niet opgeslagen. Er is geen mail verstuurd.' };
      }
      manifest = [pakket.manifest];
    }
    let uit: { verzonden: boolean; berichtId: string | null; melding: string };
    try {
      uit = await input.verstuur(plan.mail);
    } catch (error) {
      uit = { verzonden: false, berichtId: null, melding: veiligLog(error instanceof Error ? error.message : 'Verzenden mislukt.') };
    }
    if (uit.verzonden && !uit.berichtId) {
      return { ok: false, melding: 'De mailprovider gaf geen mail-ID. De verzending blijft bezig en is niet opnieuw gestart.' };
    }
    const geaccepteerd = Boolean(uit.berichtId);
    await zetStatus(plan.mail.idempotentie, geaccepteerd ? 'verzonden' : 'geweigerd', uit.berichtId);
    if (geaccepteerd && (plan.mail.soort === 'contract' || plan.mail.soort === 'herhaling')) {
      await input.client.from('contract_tekeningen').update({ vrijgegeven: true }).eq('boeking_id', Number(input.boekingId)).eq('versie', plan.mail.versie);
    }
    if (!geaccepteerd) {
      await input.client.from('contract_tekeningen').update({ verloopt_op: new Date().toISOString(), vrijgegeven: false }).eq('boeking_id', Number(input.boekingId)).eq('versie', plan.mail.versie);
      return { ok: false, melding: uit.melding || 'De mailprovider heeft de mail niet geaccepteerd. Er is niets als verzonden genoteerd.' };
    }
    if (plan.mail.soort === 'contract' || plan.mail.soort === 'herhaling') {
      await input.client.from('documenten').insert({
        boeking_id: Number(input.boekingId),
        type: 'contract',
        bestandsnaam: manifest[0]?.bestandsnaam || `${plan.mail.versie}.pdf`,
        storage_pad: `contracten/${input.boekingId}/pakket-v${plan.mail.versie}.pdf`,
        mime_type: 'application/pdf',
        grootte_bytes: manifest[0]?.bytes ?? null,
      });
    }
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
