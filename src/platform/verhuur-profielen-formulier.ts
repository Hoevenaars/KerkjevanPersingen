import { leesAutocontractProfiel, type AutocontractProfiel } from './autocontract-profiel.ts';

export const PROFIEL_TYPEN = ['expositie', 'bruiloft', 'concert', 'diverse'] as const;
export function leesVerhuurProfielenFormulier(data: { get(naam: string): unknown }):
  { ok: true; profielen: Record<string, AutocontractProfiel>; machine: Record<string, unknown> } | { ok: false; melding: string } {
  const lees = (naam: string) => String(data.get(naam) ?? '').trim();
  const profielen: Record<string, AutocontractProfiel> = {};
  for (const soort of PROFIEL_TYPEN) {
    const sleutel = (veld: string) => `profiel:${soort}:${veld}`;
    if (lees(sleutel('actief')) !== 'ja') continue;
    const bedrag = lees(sleutel('aanbetalingEuro')).replace(',', '.');
    const profiel = leesAutocontractProfiel({ tijdVan: lees(sleutel('tijdVan')), tijdTot: lees(sleutel('tijdTot')),
      opbouw: lees(sleutel('opbouw')), afbouw: lees(sleutel('afbouw')),
      aanbetalingEuro: /^\d+(\.\d{1,2})?$/.test(bedrag) ? Number(bedrag) : NaN,
      betalingBinnenDagen: Number(lees(sleutel('betalingBinnenDagen'))),
      restantMaandenVoorStart: Number(lees(sleutel('restantMaandenVoorStart'))),
      kortVoorStartVolledig: lees(sleutel('kortVoorStartVolledig')) === 'ja',
      restFactuurDagenVoorVerval: Number(lees(sleutel('restFactuurDagenVoorVerval')) || 0),
    });
    if (!profiel) return { ok: false, melding: `Vul volledige geldige standaardafspraken in voor ${soort === 'diverse' ? 'Overig' : soort}.` };
    profielen[soort] = profiel;
  }
  const actief = lees('machine_actief') === 'ja';
  const vanaf = lees('machine_vanaf');
  if (vanaf && (!/^\d{4}-\d{2}-\d{2}$/.test(vanaf) || !Number.isFinite(Date.parse(`${vanaf}T12:00:00Z`)) || new Date(`${vanaf}T12:00:00Z`).toISOString().slice(0, 10) !== vanaf)) {
    return { ok: false, melding: 'De startdatum is ongeldig.' };
  }
  if (actief && (!vanaf || !Object.keys(profielen).length)) return { ok: false, melding: 'Kies vóór activeren een startdatum en minimaal één volledig contractprofiel.' };
  return { ok: true, profielen, machine: { actief, vanaf: vanaf || null, historieCompleet: lees('historie_compleet') === 'ja',
    beleid: { maanden: 18, grondslag: 'einde_begin', versie: 'expositie-18m-einde-begin-v1' } } };
}
