/**
 * Invoer van /vrienden/aanmelden/.
 * Voor- en achternaam en toestemming zijn verplicht. Telefoon en geboortedatum niet.
 * De geboortedatum is er zodat later een verjaardagsmail kan worden verstuurd.
 */

export interface VriendAanmelding {
  voornaam: string;
  achternaam: string;
  email: string;
  telefoon: string | null;
  geboortedatum: string | null;
}

export interface VriendFormulier {
  voornaam: string;
  achternaam: string;
  email: string;
  telefoon: string;
  geboortedatum: string;
  toestemming: boolean;
}

export type VriendAanmeldingUitkomst =
  | { ok: true; aanmelding: VriendAanmelding; formulier: VriendFormulier }
  | { ok: false; fout: string; formulier: VriendFormulier };

export function volledigeNaam(aanmelding: Pick<VriendAanmelding, 'voornaam' | 'achternaam'>): string {
  return `${aanmelding.voornaam} ${aanmelding.achternaam}`.replace(/\s+/g, ' ').trim();
}

function geldigeNaam(waarde: string): boolean {
  return waarde.length > 0 && waarde.length <= 80 && /[\p{L}]/u.test(waarde) && /^[\p{L}\p{M}'’.\- ]+$/u.test(waarde);
}

export function leesVriendAanmelding(ruw: {
  voornaam?: unknown;
  achternaam?: unknown;
  email?: unknown;
  telefoon?: unknown;
  geboortedatum?: unknown;
  toestemming?: unknown;
}, vandaag: string): VriendAanmeldingUitkomst {
  const formulier: VriendFormulier = {
    voornaam: tekst(ruw.voornaam, 80),
    achternaam: tekst(ruw.achternaam, 80),
    email: tekst(ruw.email, 200).toLowerCase(),
    telefoon: tekst(ruw.telefoon, 40),
    geboortedatum: tekst(ruw.geboortedatum, 10),
    toestemming: ruw.toestemming === true || ruw.toestemming === 'ja',
  };

  if (!geldigeNaam(formulier.voornaam)) {
    return { ok: false, fout: 'Vul je voornaam in.', formulier };
  }
  if (!geldigeNaam(formulier.achternaam)) {
    return { ok: false, fout: 'Vul je achternaam in.', formulier };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formulier.email)) {
    return { ok: false, fout: 'Vul een geldig e-mailadres in.', formulier };
  }

  const telefoon = normaliseerTelefoon(formulier.telefoon);
  if (telefoon === 'ongeldig') {
    return { ok: false, fout: 'Vul een geldig telefoonnummer in, of laat het veld leeg.', formulier };
  }

  const geboortedatum = leesGeboortedatum(formulier.geboortedatum, vandaag);
  if (geboortedatum === 'ongeldig') {
    return { ok: false, fout: 'Vul een geldige geboortedatum in, of laat het veld leeg.', formulier };
  }
  if (geboortedatum === 'toekomst') {
    return { ok: false, fout: 'Een geboortedatum kan niet in de toekomst liggen.', formulier };
  }

  if (!formulier.toestemming) {
    return { ok: false, fout: 'Vink aan dat je akkoord gaat met de privacyverklaring en de vriendenmail.', formulier };
  }

  return {
    ok: true,
    formulier,
    aanmelding: {
      voornaam: formulier.voornaam,
      achternaam: formulier.achternaam,
      email: formulier.email,
      telefoon,
      geboortedatum,
    },
  };
}

function tekst(waarde: unknown, max: number): string {
  return String(waarde ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normaliseerTelefoon(waarde: string): string | null | 'ongeldig' {
  if (!waarde) return null;
  const compact = waarde.replace(/[\s().-]/g, '');
  if (!/^\+?[0-9]{8,15}$/.test(compact)) return 'ongeldig';
  return compact;
}

function leesGeboortedatum(waarde: string, vandaag: string): string | null | 'ongeldig' | 'toekomst' {
  if (!waarde) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(waarde) || !echteDatum(waarde) || waarde < '1900-01-01') return 'ongeldig';
  if (waarde > vandaag) return 'toekomst';
  return waarde;
}

function echteDatum(ymd: string): boolean {
  const [jaar, maand, dag] = ymd.split('-').map(Number);
  const datum = new Date(Date.UTC(jaar, maand - 1, dag));
  return datum.getUTCFullYear() === jaar && datum.getUTCMonth() === maand - 1 && datum.getUTCDate() === dag;
}
