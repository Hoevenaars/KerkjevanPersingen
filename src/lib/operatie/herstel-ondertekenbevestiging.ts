/** Menselijke reconciliatie per ontvanger; deze helper roept geen provider aan. */
import { magSchrijven } from '../../platform/rechten.ts';
import type { Actor } from './kern.ts';
import type { ContractTekenClient } from './contract-tekenwinkel.ts';

export async function herstelOndertekenbevestiging(input: {
  client: Pick<ContractTekenClient, 'rpc'>;
  actor: Actor;
  boekingId: number;
  contractversieId: number;
  richting: 'huurder' | 'bestuur';
  uitkomst: 'geaccepteerd' | 'niet_verzonden';
  providerId?: string;
  bewijs: string;
}): Promise<{ ok: boolean; melding: string; hervat?: boolean; status?: 'onzeker' | 'afgerond' | 'te_doen' }> {
  const rechten = input.actor.rechten ?? { isSuperAdmin: false, perModule: {} };
  if (input.actor.type !== 'gebruiker' || !magSchrijven(rechten, 'instellingen') ||
      !(magSchrijven(rechten, 'aanvragen') || magSchrijven(rechten, 'boekingen'))) {
    return { ok: false, melding: 'Alleen een bevoegde beheerder mag het ontvangstbewijs herstellen.' };
  }
  const bewijs = input.bewijs.trim();
  const providerId = input.providerId?.trim() || null;
  if (!Number.isSafeInteger(input.boekingId) || input.boekingId < 1 || !Number.isSafeInteger(input.contractversieId) || input.contractversieId < 1 ||
      !['huurder', 'bestuur'].includes(input.richting) || !['geaccepteerd', 'niet_verzonden'].includes(input.uitkomst) ||
      bewijs.length < 20 || bewijs.length > 2000 || (providerId?.length ?? 0) > 200 ||
      (input.uitkomst === 'geaccepteerd' && !providerId)) {
    return { ok: false, melding: 'Kies de juiste ontvanger en leg het gecontroleerde providerbewijs vast. Bij acceptatie is het providerbericht-id verplicht.' };
  }
  try {
    const r = await input.client.rpc('herstel_contract_ontvangstmail', {
      p_boeking_id: input.boekingId, p_contractversie_id: input.contractversieId,
      p_richting: input.richting, p_uitkomst: input.uitkomst,
      p_provider_id: input.uitkomst === 'geaccepteerd' ? providerId : null, p_bewijs: bewijs,
    });
    const data = r.data as Record<string, unknown> | null;
    if (r.error || data?.ok !== true || typeof data.hervat !== 'boolean' || !['onzeker', 'afgerond', 'te_doen'].includes(String(data.status))) {
      return { ok: false, melding: r.error?.message || 'Het herstel is niet bevestigd. De mail is niet opnieuw verstuurd.' };
    }
    const status = data.status as 'onzeker' | 'afgerond' | 'te_doen';
    return {
      ok: true, hervat: data.hervat, status,
      melding: status === 'onzeker'
        ? `Het bewijs voor de ${input.richting === 'huurder' ? 'huurder' : 'bestuursmelding'} is vastgelegd. Controleer ook de andere ontvanger voordat de stap kan hervatten.`
        : status === 'afgerond' ? 'Beide ontvangstbevestigingen zijn bewezen verstuurd. Er is geen nieuwe mail verzonden.'
          : 'Het gecontroleerde bewijs is vastgelegd. De resterende ontvangstmail kan veilig worden hervat.',
    };
  } catch {
    return { ok: false, melding: 'Het herstel kon niet worden bevestigd. Controleer de opgeslagen stand voordat u doorgaat.' };
  }
}
