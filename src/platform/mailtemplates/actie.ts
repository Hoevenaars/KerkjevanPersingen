import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export type MailActieSoort =
  | 'goedkeuren'
  | 'meer_info'
  | 'afwijzen'
  | 'content_goedkeuren'
  | 'content_aanpassen'
  | 'gastheer_ja'
  | 'gastheer_nee'
  | 'post_ok'
  | 'post_melding';

export interface MailActiePayload {
  actie: MailActieSoort;
  boekingId: string;
  aanvraagId?: string;
  templateId: string;
  verloopt: number;
}

const geheugenTokens = new Map<string, MailActiePayload>();

function geheim(): string {
  return process.env.MAIL_ACTIE_GEHEIM ?? process.env.CRON_SECRET ?? 'dev-mail-actie-geheim';
}

export function maakActieToken(payload: Omit<MailActiePayload, 'verloopt'>, geldigDagen = 7): string {
  const verloopt = Date.now() + geldigDagen * 86_400_000;
  const volledig: MailActiePayload = { ...payload, verloopt };
  const nonce = randomBytes(12).toString('hex');
  const body = JSON.stringify({ ...volledig, nonce });
  const sig = createHmac('sha256', geheim()).update(body).digest('hex');
  const token = Buffer.from(`${body}.${sig}`).toString('base64url');
  geheugenTokens.set(token, volledig);
  return token;
}

export function leesActieToken(token: string): MailActiePayload | null {
  const cached = geheugenTokens.get(token);
  if (cached && cached.verloopt >= Date.now()) return cached;
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const idx = decoded.lastIndexOf('.');
    if (idx < 0) return null;
    const body = decoded.slice(0, idx);
    const sig = decoded.slice(idx + 1);
    const verwacht = createHmac('sha256', geheim()).update(body).digest('hex');
    if (sig.length !== verwacht.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(verwacht))) return null;
    const parsed = JSON.parse(body) as MailActiePayload & { nonce?: string };
    if (parsed.verloopt < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function actieBevestigingsTitel(actie: MailActieSoort): string {
  switch (actie) {
    case 'goedkeuren':
      return 'Aanvraag goedkeuren?';
    case 'meer_info':
      return 'Meer informatie vragen?';
    case 'afwijzen':
      return 'Aanvraag afwijzen?';
    case 'content_goedkeuren':
      return 'Content goedkeuren?';
    case 'content_aanpassen':
      return 'Aanpassing vragen?';
    case 'gastheer_ja':
      return 'Gastheerschap bevestigen?';
    case 'gastheer_nee':
      return 'Niet beschikbaar melden?';
    case 'post_ok':
      return 'Activiteit afgerond?';
    case 'post_melding':
      return 'Bijzonderheid melden?';
    default:
      return 'Actie bevestigen?';
  }
}
