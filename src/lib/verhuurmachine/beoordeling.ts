import { beoordeelVerhuuraanvraag, type VerhuurBeoordeling, type ExpositieHistorie, type ExpositieBeleid } from '../../platform/verhuur-beoordeling.ts';
import { kiesTarief, type Tariefregel } from '../../platform/finance.ts';
import { parseMedeExposanten } from '../../platform/mede-exposanten.ts';
import { ymdInAmsterdam } from '../../platform/datum.ts';
import { berekenAutocontractTermijnen, leesAutocontractProfiel } from '../../platform/autocontract-profiel.ts';
import type { Aanvraag } from '../validatie.ts';

export type Rij = Record<string, unknown>;
export interface MachineClient {
  rpc(naam: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
  // De concrete client is de bestaande server-only Supabaseclient. Deze adapter
  // blijft zonder SDK importeerbaar voor netwerkvrije ketentests.
  from(tabel: string): any;
}
export const tekst = (v: unknown): string => v == null ? '' : String(v);
const rijen = (v: unknown): Rij[] => Array.isArray(v) ? v as Rij[] : [];
const object = (v: unknown): Rij => v && typeof v === 'object' && !Array.isArray(v) ? v as Rij : {};

export interface BeoordelingsDossier {
  bron: Rij;
  aanvraag: Aanvraag;
  aanvraagRij: Rij;
  aanvraagVersie: string;
  bronVersie: string;
  beoordeling: VerhuurBeoordeling;
}

export function dossierUitBron(bron: Rij, vandaag = ymdInAmsterdam(new Date())): BeoordelingsDossier {
  const a = object(bron.aanvraag);
  const instellingen = object(bron.instellingen);
  const config = object(instellingen.verhuur_machine);
  const aanvragen = rijen(bron.aanvragen), boekingen = rijen(bron.boekingen);
  const tarieven: Tariefregel[] = rijen(bron.tarieven).map(r => ({
    verhuurtype: tekst(r.verhuurtype_sleutel), prijstype: tekst(r.prijstype) as Tariefregel['prijstype'],
    bedrag: r.bedrag == null ? null : Number(r.bedrag), geldigVanaf: tekst(r.geldig_vanaf), geldigTot: tekst(r.geldig_tot) || null,
  }));
  const tarief = kiesTarief(tarieven, tekst(a.verhuurtype_sleutel), tekst(a.start_datum));
  const deelnemers = (r: Rij, boeking: boolean) => [
    { naam: tekst(boeking ? r.huurder_naam_snapshot : r.naam), email: tekst(boeking ? r.huurder_email_snapshot : r.email),
      relatieId: (boeking ? r.huurder_relatie_id : r.relatie_id) as number | null },
    ...parseMedeExposanten(tekst(r.mede_exposanten)).map(naam => ({ naam })),
  ];
  const historie: ExpositieHistorie[] = [
    ...boekingen.filter(r => r.verhuurtype_sleutel === 'expositie').map(r => ({
      id: `boeking:${r.id}`, expositieId: `boeking:${r.id}`, bron: 'Boeking', referentie: tekst(r.nummer) || `Boeking ${r.id}`,
      boekingId: r.id as number, aanvraagId: r.aanvraag_id as number | null,
      start: tekst(r.start_datum), eind: tekst(r.eind_datum), status: tekst(r.status), verhuurtype: 'expositie', deelnemers: deelnemers(r, true),
    })),
    ...aanvragen.filter(r => r.verhuurtype_sleutel === 'expositie' && !r.boeking_id).map(r => ({
      id: `aanvraag:${r.id}`, expositieId: `aanvraag:${r.id}`, bron: 'Aanvraag', referentie: `Aanvraag ${r.id}`,
      aanvraagId: r.id as number, start: tekst(r.start_datum), eind: tekst(r.eind_datum), status: tekst(r.status), verhuurtype: 'expositie', deelnemers: deelnemers(r, false),
    })),
  ];
  const beoordeling = beoordeelVerhuuraanvraag({
    aanvraag: { id: a.id as number, status: tekst(a.status), naam: tekst(a.naam), email: tekst(a.email),
      start: tekst(a.start_datum), eind: tekst(a.eind_datum), verhuurtype: tekst(a.verhuurtype_sleutel),
      boekingId: a.boeking_id as number | null, relatieId: a.relatie_id as number | null, medeExposanten: tekst(a.mede_exposanten),
      personen: tekst(a.aantal_personen), telefoon: tekst(a.telefoon), adres: tekst(a.adres), toelichting: tekst(a.toelichting),
      website: tekst(a.website), eerderGeexposeerd: tekst(a.eerder_geexposeerd), afspraken: instellingen,
    },
    aanvragen: aanvragen.map(r => ({ id: r.id as number, status: tekst(r.status), naam: tekst(r.naam), start: tekst(r.start_datum), eind: tekst(r.eind_datum), boekingId: r.boeking_id as number | null, binnengekomenOp: tekst(r.binnengekomen_op) })),
    boekingen: boekingen.map(r => ({ id: r.id as number, status: tekst(r.status), naam: tekst(r.huurder_naam_snapshot), nummer: tekst(r.nummer), start: tekst(r.start_datum), eind: tekst(r.eind_datum), aanvraagId: r.aanvraag_id as number | null })),
    activiteiten: [
      ...rijen(bron.activiteiten).map(r => ({ id: `activiteit:${r.id}`, titel: tekst(r.titel), start: tekst(r.start_datum), eind: tekst(r.eind_datum), zichtbaarheid: tekst(r.zichtbaarheid), levenscyclus: tekst(r.levenscyclus), annuleringBevestigd: r.annulering === true })),
      ...rijen(bron.blokkades).map(r => ({ id: `intern:${r.id}`, titel: tekst(r.titel), start: tekst(r.start_datum), eind: tekst(r.eind_datum), blokkeert: r.blokkeert_verhuurkalender === true })),
    ],
    historie, historieCompleet: config.historieCompleet === true, tarief, vandaag, beleid: object(config.beleid) as ExpositieBeleid,
  });
  const aanvraag = {
    soort: tekst(a.verhuurtype_sleutel), datum: tekst(a.start_datum), datumTot: tekst(a.eind_datum), naam: tekst(a.naam), email: tekst(a.email),
    telefoon: tekst(a.telefoon), adres: tekst(a.adres), straat: tekst(a.straat), huisnummer: tekst(a.huisnummer), toevoeging: tekst(a.huisnummer_toevoeging),
    postcode: tekst(a.postcode), woonplaats: tekst(a.woonplaats), personen: tekst(a.aantal_personen), toelichting: tekst(a.toelichting),
    website: tekst(a.website), eerderGeexposeerd: tekst(a.eerder_geexposeerd), medeExposanten: tekst(a.mede_exposanten),
    akkoordVoorwaarden: a.akkoord_voorwaarden === true ? 'ja' : '', fotoNamen: rijen(bron.fotos).map(r => tekst(r.naam)),
    negeerWaarschuwing: '',
  } as Aanvraag;
  if (bron.foto_upload_open === true) aanvraag.toelichting += '\n\nLet op: het uploaden van foto’s is nog niet afgerond. Controleer dit in het dossier.';
  return { bron, aanvraag, aanvraagRij: a, aanvraagVersie: tekst(bron.aanvraag_versie), bronVersie: tekst(bron.bron_versie), beoordeling };
}

export async function leesVerhuurBeoordeling(client: MachineClient, aanvraagId: number, vandaag?: string): Promise<BeoordelingsDossier> {
  const r = await client.rpc('verhuur_beoordelingsbron', { p_aanvraag_id: aanvraagId });
  if (r.error || !r.data) throw new Error(r.error?.message || 'De aanvraag kan niet worden beoordeeld.');
  return dossierUitBron(r.data as Rij, vandaag);
}

export function controleerBestuursPrijs(dossier: BeoordelingsDossier, cent: number | null): string | null {
  if (cent == null || !Number.isSafeInteger(cent) || cent <= 0) return 'Vul de definitieve totale huurprijs in.';
  const instellingen = object(dossier.bron.instellingen);
  const profielen = object(instellingen.verhuur_autocontract_profielen);
  const profiel = leesAutocontractProfiel(profielen[dossier.aanvraag.soort]);
  // Een ontbrekend profiel blijft een concrete uitvoertaak; geen verzonnen afspraken.
  if (!profiel) return null;
  const termijnen = berekenAutocontractTermijnen({ prijsEuro: cent / 100, profiel, vandaag: dossier.beoordeling.vandaag, start: dossier.aanvraag.datum });
  return termijnen.ok ? null : termijnen.melding;
}

export async function neemVerhuurBesluit(input: {
  client: MachineClient; dossier: BeoordelingsDossier; besluit: 'ja' | 'nee'; prijsCent: number | null; tokenHash?: string; reden?: string;
}): Promise<Rij> {
  const { dossier, besluit } = input;
  if (besluit === 'ja') {
    const blok = dossier.beoordeling.meldingen.find(m => ['periode_onvolledig','beleid_onvolledig'].includes(m.code));
    if (blok) throw new Error(blok.tekst);
    const fout = controleerBestuursPrijs(dossier, input.prijsCent);
    if (fout) throw new Error(fout);
  }
  const b = dossier.beoordeling;
  const r = await input.client.rpc('verhuur_neem_besluit', {
    p_aanvraag_id: Number(dossier.aanvraagRij.id), p_aanvraag_versie: dossier.aanvraagVersie, p_bron_versie: dossier.bronVersie,
    p_besluit: besluit, p_huurprijs_euro: besluit === 'ja' ? input.prijsCent! / 100 : null,
    p_waarschuwingen: [...b.conflicts, ...b.historieWaarschuwingen, ...b.meldingen],
    p_beleid: { ...b.beleid, afwijking18Maanden: b.historieWaarschuwingen.length > 0, waarschuwingen: b.historieWaarschuwingen },
    p_token_hash: input.tokenHash ?? null, p_reden: input.reden ?? '',
  });
  if (r.error || !r.data) throw new Error(r.error?.message || 'Het besluit is niet opgeslagen.');
  return r.data as Rij;
}
