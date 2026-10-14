/**
 * Aanleverfoto's blijven privé tot beheer ze publiceert.
 * public-media is daarvoor niet geschikt: die bucket is openbaar.
 */

export const INTAKE_BUCKET = 'content-intake';
export const INTAKE_MAX_BYTES = 8_000_000;
export const INTAKE_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type IntakeMime = (typeof INTAKE_MIMES)[number];
export type IntakeRol = 'hoofd' | 'extra';

export interface IntakeBestand {
  pad: string;
  mime: IntakeMime;
  rol: IntakeRol;
  bytes: number;
}

export function valideerIntakeBestand(bestand: { type: string; size: number }): { ok: true; mime: IntakeMime } | { ok: false; reden: string } {
  if (bestand.size <= 0) return { ok: false, reden: 'Het bestand is leeg.' };
  if (bestand.size > INTAKE_MAX_BYTES) return { ok: false, reden: 'De afbeelding is groter dan 8 MB.' };
  const mime = bestand.type.trim().toLowerCase();
  if (!INTAKE_MIMES.includes(mime as IntakeMime)) return { ok: false, reden: 'Gebruik een JPEG, PNG of WebP.' };
  return { ok: true, mime: mime as IntakeMime };
}

export function intakePad(boekingId: string, mime: IntakeMime, id: string): string {
  const map = boekingId.replace(/[^0-9]/g, '');
  if (!map || !/^[0-9a-f-]{8,}$/i.test(id)) return '';
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  return `intake/${map}/${id}.${ext}`;
}

/** Bestaande paden blijven staan. Een nieuwe hoofdfoto vult alleen een leeg dossier. */
export function planIntake(input: {
  boekingId: string;
  bestaandHoofd: string;
  bestaandPaden: readonly string[];
  bestanden: readonly { mime: IntakeMime; bytes: number; id: string; alsHoofd: boolean }[];
}): { ok: true; bestanden: IntakeBestand[]; hoofd: string } | { ok: false; reden: string } {
  const bezet = new Set(input.bestaandPaden);
  const gekozen: IntakeBestand[] = [];
  let hoofd = input.bestaandHoofd && input.bestaandHoofd !== 'aangeleverd' ? input.bestaandHoofd : '';
  for (const bestand of input.bestanden) {
    const pad = intakePad(input.boekingId, bestand.mime, bestand.id);
    if (!pad) return { ok: false, reden: 'Ongeldig dossierpad.' };
    if (bezet.has(pad)) return { ok: false, reden: 'Dit bestandspad bestaat al. Er is niets overschreven.' };
    const rol: IntakeRol = bestand.alsHoofd && !hoofd ? 'hoofd' : 'extra';
    if (rol === 'hoofd') hoofd = pad;
    bezet.add(pad);
    gekozen.push({ pad, mime: bestand.mime, rol, bytes: bestand.bytes });
  }
  return { ok: true, bestanden: gekozen, hoofd };
}

export function fotoPadNaAanlevering(bestaand: string, nieuwHoofd: string | undefined, vlag: boolean): string {
  const echt = bestaand && bestaand !== 'aangeleverd' ? bestaand : '';
  if (echt) return echt;
  if (nieuwHoofd && nieuwHoofd !== 'aangeleverd') return nieuwHoofd;
  if (vlag) return 'aangeleverd';
  return bestaand === 'aangeleverd' ? 'aangeleverd' : '';
}
