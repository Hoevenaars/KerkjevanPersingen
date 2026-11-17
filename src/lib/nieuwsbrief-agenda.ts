import type { Activiteit, AgendaOverzicht } from './content';
import type { VriendFrequentie } from './nieuwsbrief-frequentie.ts';
import { formatDatumBereik } from './datum.ts';
import { directeFotoUrl } from './agenda-zichtbaarheid.ts';
import {
  activiteitRaaktWeekend,
  komendWeekend,
  kopAgendaBlok,
} from './week.ts';
import { filterActiviteitenInPeriode } from './nieuwsbrief-frequentie.ts';
import { secondNaturePoster } from './second-nature.ts';
import { natuurlijkFlyer } from './natuurlijk-in-het-kwadraat.ts';
import { SFEER_URL, type NieuwsbriefActiviteitBlok } from './nieuwsbrief-html.ts';
import { formatWinterstopDatum, isWinterstop, winterstopFoto, WINTERSTOP_FOTO_ALT, WINTERSTOP_TEKST, WINTERSTOP_TITEL } from './winterstop.ts';

function kiesActiviteit(
  agenda: AgendaOverzicht,
  nu = new Date(),
): {activiteit: Activiteit | null; kop: string} {
  const weekend = komendWeekend(nu);
  const kandidaten = [agenda.vandaag, agenda.volgende, agenda.daarna].filter(
    (item): item is Activiteit => Boolean(item),
  );
  const ditWeekend = kandidaten.find((item) =>
    activiteitRaaktWeekend(item.start, item.eind, weekend),
  );
  if (ditWeekend) return {activiteit: ditWeekend, kop: kopAgendaBlok(true)};
  const volgende = agenda.vandaag ?? agenda.volgende;
  return {activiteit: volgende ?? null, kop: volgende ? kopAgendaBlok(false) : kopAgendaBlok(true)};
}

function naarActiviteitBlok(activiteit: Activiteit, kop: string): NieuwsbriefActiviteitBlok {
  const cmsFoto = directeFotoUrl(activiteit.foto);
  const winter = isWinterstop(activiteit.soort);
  return {
    titel: winter ? WINTERSTOP_TITEL : (activiteit.publiekeTitel || activiteit.interneTitel),
    datumTekst: winter ? formatWinterstopDatum(activiteit.start, activiteit.eind) : formatDatumBereik(activiteit),
    omschrijving: winter
      ? WINTERSTOP_TEKST
      : (activiteit.korteOmschrijving?.trim() || activiteit.omschrijving?.trim() || '').slice(0, 155) || undefined,
    fotoUrl: winter
      ? winterstopFoto({ absoluut: true })
      : secondNaturePoster(activiteit, { absoluut: true }) ?? cmsFoto ?? natuurlijkFlyer(activiteit, { absoluut: true }) ?? SFEER_URL,
    fotoAlt: winter ? WINTERSTOP_FOTO_ALT : (activiteit.fotoAlt || 'Het kerkje van Persingen in de Ooijpolder'),
    agendaUrl: activiteit.slug
      ? `https://kerkjepersingen.nl/agenda/${activiteit.slug}/`
      : 'https://kerkjepersingen.nl/agenda/',
    kop,
    isExpositie: activiteit.soort === 'expositie',
  };
}

/** Publieke activiteiten die het weekend van deze nieuwsbriefweek raken. */
export function activiteitenDitWeekend(activiteiten: readonly Activiteit[], weekMaandag: string): Activiteit[] {
  const vrijdag = new Date(`${weekMaandag}T12:00:00Z`);
  vrijdag.setUTCDate(vrijdag.getUTCDate() + 4);
  const weekend = komendWeekend(vrijdag);
  return activiteiten.filter((item) =>
    item.zichtbaarheid === 'publiek'
    && !item.geannuleerd
    && activiteitRaaktWeekend(item.start, item.eind, weekend),
  );
}

/** Het weekendblok van één nieuwsbriefweek, dezelfde opmaak als de verstuurde mail. */
export function blokkenVoorWeek(activiteiten: readonly Activiteit[], weekMaandag: string): NieuwsbriefActiviteitBlok[] {
  const raakt = activiteitenDitWeekend(activiteiten, weekMaandag);
  const gekozen = raakt.find((item) => !isWinterstop(item.soort)) ?? raakt[0];
  if (!gekozen) return [];
  return [naarActiviteitBlok(gekozen, kopAgendaBlok(true))];
}

/** Kiest activiteiten voor de mail, afgestemd op de ontvangstfrequentie. */
export function kiesActiviteitenVoorMail(
  alleActiviteiten: Activiteit[],
  agenda: AgendaOverzicht,
  frequentie: VriendFrequentie | undefined,
  nu = new Date(),
): NieuwsbriefActiviteitBlok[] {
  const keuze = frequentie ?? 'wekelijks';

  if (keuze === 'wekelijks') {
    const {activiteit, kop} = kiesActiviteit(agenda, nu);
    return activiteit ? [naarActiviteitBlok(activiteit, kop)] : [];
  }

  const periode = filterActiviteitenInPeriode(alleActiviteiten, keuze, nu);
  return periode.map((activiteit) => naarActiviteitBlok(activiteit, ''));
}
