/**
 * Beslissingen voor handmatige dossieracties.
 * Geen bank, geen mail, geen publicatie en geen verzonnen bedrag.
 */

import { periodesOverlappen } from './datum.ts';
import { boekingBezetKalender } from './verhuur-overzicht.ts';
import { valideerVerhuurperiode } from './verhuur.ts';
import { STANDAARD_VERHUURTYPEN, type Verhuurtype } from './types.ts';

export interface BetaalRegel {
  soort: string;
  status: string;
}

export type BetaalKeuze = 'aanbetaling' | 'volledig';
export type BetaalSoort = 'aanbetaling' | 'restant';

function regelsVan(regels: readonly BetaalRegel[], soort: BetaalSoort): BetaalRegel[] {
  return regels.filter((regel) => regel.soort === soort);
}

export function beoordeelHandmatigeBetaling(input: {
  keuze: string;
  regels: readonly BetaalRegel[];
}): { ok: true; keuze: BetaalKeuze; markeer: BetaalSoort[]; zetVlag: boolean; tekst: string } | { ok: false; melding: string } {
  if (input.keuze !== 'aanbetaling' && input.keuze !== 'volledig') {
    return { ok: false, melding: 'Kies aanbetaling ontvangen of volledige betaling binnen. Er is niets gewijzigd.' };
  }
  const gewenst: BetaalSoort[] = input.keuze === 'aanbetaling' ? ['aanbetaling'] : ['aanbetaling', 'restant'];
  const markeer: BetaalSoort[] = [];
  const ontbreekt: BetaalSoort[] = [];
  const al: BetaalSoort[] = [];
  for (const soort of gewenst) {
    const vanSoort = regelsVan(input.regels, soort);
    if (vanSoort.length === 0) {
      ontbreekt.push(soort);
      continue;
    }
    if (vanSoort.some((regel) => regel.status === 'open')) markeer.push(soort);
    else if (vanSoort.some((regel) => regel.status === 'ontvangen')) al.push(soort);
  }
  if (markeer.length === 0) {
    if (ontbreekt.length === gewenst.length) {
      return {
        ok: false,
        melding: 'Er is geen betaalregel voor deze keuze. Er is geen bedrag verzonnen en er is niets van de bank opgehaald.',
      };
    }
    return {
      ok: false,
      melding: 'Deze betaling stond al op ontvangen. Er is niets gewijzigd en er is niets van de bank opgehaald.',
    };
  }
  const namen = markeer.map((soort) => (soort === 'aanbetaling' ? 'aanbetaling' : 'restant')).join(' en ');
  const gemist = ontbreekt.filter((soort) => gewenst.includes(soort));
  const extra = gemist.length > 0
    ? ` Er is geen ${gemist.map((soort) => (soort === 'aanbetaling' ? 'aanbetalingsregel' : 'restantregel')).join(' en ')}, dus die is niet aangemaakt.`
    : '';
  const aanbetalingAanwezig = regelsVan(input.regels, 'aanbetaling').some((regel) => regel.status === 'ontvangen') || markeer.includes('aanbetaling');
  return {
    ok: true,
    keuze: input.keuze,
    markeer,
    zetVlag: aanbetalingAanwezig,
    tekst: `${namen.charAt(0).toUpperCase()}${namen.slice(1)} wordt op ontvangen gezet.${extra} Er is niets van de bank opgehaald, de boekingsstatus blijft staan en er gaat geen mail uit.`,
  };
}

export function beoordeelVerplaatsing(input: {
  status: string;
  verhuurtype: string;
  start: string;
  eind: string;
  huidigStart: string;
  huidigEind: string;
  overlapNummers: readonly string[];
}): { ok: true; start: string; eind: string } | { ok: false; melding: string } {
  if (input.status === 'geannuleerd' || input.status === 'afgerond' || input.status === 'gearchiveerd' || input.status === 'afgewezen') {
    return { ok: false, melding: 'Een gesloten of geannuleerde boeking wordt niet verplaatst. Er is niets gewijzigd.' };
  }
  if (!input.verhuurtype.trim()) {
    return { ok: false, melding: 'Kies eerst het verhuurtype. Er is niets gewijzigd.' };
  }
  const start = input.start.trim();
  const eind = input.eind.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(eind)) {
    return { ok: false, melding: 'Vul een begin- en einddatum in. Er is niets gewijzigd.' };
  }
  if (start === input.huidigStart && eind === input.huidigEind) {
    return { ok: false, melding: 'De periode is niet gewijzigd. Er is niets opgeslagen.' };
  }
  const periode = valideerVerhuurperiode(input.verhuurtype, start, eind);
  if (!periode.ok) {
    return { ok: false, melding: `${periode.fouten[0]?.melding ?? 'De periode is niet geldig.'} Er is niets gewijzigd.` };
  }
  if (input.overlapNummers.length > 0) {
    return {
      ok: false,
      melding: `Niet verplaatst. De periode overlapt met ${input.overlapNummers.join(', ')}. Er is niets gewijzigd.`,
    };
  }
  return { ok: true, start, eind };
}

export function overlapNummers(input: {
  boekingId: string;
  start: string;
  eind: string;
  boekingen: readonly { id: string; status: string; start: string; eind: string; nummer?: string }[];
}): string[] {
  const nummers: string[] = [];
  for (const ander of input.boekingen) {
    if (ander.id === input.boekingId) continue;
    if (!boekingBezetKalender(ander.status)) continue;
    if (!periodesOverlappen(
      { start: input.start, eind: input.eind },
      { start: ander.start, eind: ander.eind || ander.start },
    )) continue;
    nummers.push(ander.nummer?.trim() || ander.id);
  }
  return nummers;
}

export function beoordeelVerhuurtype(
  huidig: string,
  gekozen: string,
  typen: readonly Verhuurtype[] = STANDAARD_VERHUURTYPEN,
): { ok: true; verhuurtype: string; naam: string } | { ok: false; melding: string } {
  const sleutel = gekozen.trim();
  const type = typen.find((item) => item.sleutel === sleutel && item.actief);
  if (!type) return { ok: false, melding: 'Kies een bekend verhuurtype. Er is niets gewijzigd.' };
  if (sleutel === huidig.trim()) return { ok: false, melding: 'Dit verhuurtype stond er al. Er is niets gewijzigd.' };
  return { ok: true, verhuurtype: type.sleutel, naam: type.naam };
}

export function beoordeelInhoud(input: {
  besluit: string;
  reden: string;
  heeftActiviteit: boolean;
  status: string;
}): { ok: true; besluit: 'goedkeuren' | 'afkeuren'; reden: string; status: 'goedgekeurd' | 'wijziging_gevraagd' } | { ok: false; melding: string } {
  if (!input.heeftActiviteit) {
    return { ok: false, melding: 'Er is geen inhoud om te beoordelen. Er is niets opgeslagen en de site is niet gewijzigd.' };
  }
  if (input.besluit === 'goedkeuren') {
    if (input.status === 'goedgekeurd') {
      return { ok: false, melding: 'De inhoud was al goedgekeurd. Er is niets gewijzigd en de site is niet gewijzigd.' };
    }
    return { ok: true, besluit: 'goedkeuren', reden: input.reden.trim(), status: 'goedgekeurd' };
  }
  if (input.besluit === 'afkeuren') {
    const reden = input.reden.trim();
    if (!reden) return { ok: false, melding: 'Een afkeuring heeft een reden nodig. Er is niets gewijzigd en de site is niet gewijzigd.' };
    return { ok: true, besluit: 'afkeuren', reden, status: 'wijziging_gevraagd' };
  }
  return { ok: false, melding: 'Kies goedkeuren of afkeuren. Er is niets gewijzigd en de site is niet gewijzigd.' };
}

export type ContractStatus = 'geen' | 'aanwezig' | 'getekend';

export function contractBeeld(soorten: readonly string[], marker: ContractStatus | null = null): {
  status: ContractStatus;
  label: string;
  volgtBestand: boolean;
  keuzes: ContractStatus[];
} {
  const echt = soorten.filter((soort) => soort === 'contract' || soort === 'getekend_contract');
  if (echt.includes('getekend_contract')) {
    return { status: 'getekend', label: 'Getekend', volgtBestand: true, keuzes: [] };
  }
  if (echt.includes('contract')) {
    return { status: 'aanwezig', label: 'Aanwezig', volgtBestand: true, keuzes: ['getekend'] };
  }
  const status = marker ?? 'geen';
  const label = status === 'getekend' ? 'Getekend' : status === 'aanwezig' ? 'Aanwezig' : 'Geen contract';
  return { status, label, volgtBestand: false, keuzes: ['aanwezig', 'getekend', 'geen'] };
}

export function beoordeelContractstatus(
  beeld: ReturnType<typeof contractBeeld>,
  keuze: string,
): { ok: true; status: ContractStatus } | { ok: false; melding: string } {
  if (keuze !== 'geen' && keuze !== 'aanwezig' && keuze !== 'getekend') {
    return { ok: false, melding: 'Kies een contractstatus. Er is niets gewijzigd.' };
  }
  if (beeld.volgtBestand && !beeld.keuzes.includes(keuze)) {
    return { ok: false, melding: 'De contractstatus volgt het bestand. Er is niets gewijzigd.' };
  }
  if (!beeld.volgtBestand && keuze === beeld.status) {
    return { ok: false, melding: 'Deze contractstatus stond er al. Er is niets gewijzigd.' };
  }
  if (!beeld.keuzes.includes(keuze) && keuze !== beeld.status) {
    return { ok: false, melding: 'Deze contractstatus is niet beschikbaar. Er is niets gewijzigd.' };
  }
  return { ok: true, status: keuze };
}

export function leesTermijnkeuze(waarde: string | null | undefined): 'laten' | 'afboeken' | null {
  if (waarde == null || waarde.trim() === '' || waarde === 'laten') return 'laten';
  if (waarde === 'afboeken') return 'afboeken';
  return null;
}
