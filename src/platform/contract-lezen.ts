/**
 * Leest de bevroren contracttekst voor de ondertekenpagina.
 * De HTML is dezelfde tekst als de PDF, alleen anders gezet.
 * Een geüpload sjabloon blijft de PDF: die tekst wordt hier niet nagemaakt.
 */

export interface ContractBlok {
  soort: 'kop' | 'meta' | 'feit' | 'alinea';
  tekst: string;
  label?: string;
  waarde?: string;
}

export interface ContractDeel {
  id: string;
  titel: string;
  blokken: ContractBlok[];
}

function esc(waarde: string): string {
  return waarde
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function deelId(titel: string, index: number): string {
  const kern = titel.toLowerCase();
  if (kern.startsWith('huurovereenkomst')) return 'overeenkomst';
  if (kern.startsWith('verhuurvoorwaarden')) return 'voorwaarden';
  if (kern.startsWith('huisregels')) return 'huisregels';
  if (kern.startsWith('plattegrond')) return 'plattegrond';
  if (kern.startsWith('bewijs')) return 'bewijs';
  return `deel-${index + 1}`;
}

function linkify(veilig: string): string {
  return veilig.replace(/https:\/\/[^\s<]+/g, (url) => {
    const schoon = url.replace(/[),.;]+$/, '');
    const rest = url.slice(schoon.length);
    return `<a href="${schoon}">${schoon}</a>${rest}`;
  });
}

function blokVan(regel: string): ContractBlok | null {
  if (/_{4,}/.test(regel)) return null;
  if (/^VERSIE\b/.test(regel)) return { soort: 'meta', tekst: regel };
  if (/^\d+\.\s+\S/.test(regel) && regel.length <= 90) return { soort: 'kop', tekst: regel };
  const idx = regel.indexOf(': ');
  if (idx >= 2 && idx <= 48) {
    return { soort: 'feit', tekst: regel, label: regel.slice(0, idx), waarde: regel.slice(idx + 2) };
  }
  return { soort: 'alinea', tekst: regel };
}

/** Dezelfde pakkettekst als de PDF, gesplitst op de pagina-scheiding. */
export function leesContractPakket(tekst: string): ContractDeel[] {
  const delen: ContractDeel[] = [];
  tekst.split('\f').forEach((stuk, index) => {
    const regels = stuk.replace(/\r/g, '').split('\n').map((regel) => regel.trim()).filter(Boolean);
    if (regels.length === 0) return;
    const titel = regels[0];
    let id = deelId(titel, index);
    if (delen.some((deel) => deel.id === id)) id = `${id}-${index + 1}`;
    const blokken = regels.slice(1).map(blokVan).filter((blok): blok is ContractBlok => blok != null);
    delen.push({ id, titel, blokken });
  });
  return delen;
}

function blokHtml(blok: ContractBlok): string {
  if (blok.soort === 'kop') return `<h3>${esc(blok.tekst)}</h3>`;
  if (blok.soort === 'meta') return `<p class="meta-regel">${linkify(esc(blok.tekst))}</p>`;
  if (blok.soort === 'feit') return `<p class="feit"><span>${esc(blok.label ?? '')}</span>${linkify(esc(blok.waarde ?? ''))}</p>`;
  return `<p>${linkify(esc(blok.tekst))}</p>`;
}

export function contractNavHtml(delen: readonly ContractDeel[]): string {
  return delen.map((deel) => `<a href="#${esc(deel.id)}">${esc(deel.titel)}</a>`).join('');
}

export function contractWeergaveHtml(delen: readonly ContractDeel[]): string {
  const secties = delen.map((deel) => `<section id="${esc(deel.id)}"><h2>${esc(deel.titel)}</h2>${deel.blokken.map(blokHtml).join('')}</section>`);
  return `<article class="contract">${secties.join('')}</article>`;
}

/** Foutpagina zonder contractinhoud en zonder de token. */
export function tekenFoutHtml(melding: string): string {
  const tekst = melding.replace(/\s+/g, ' ').trim() || 'Deze link is ongeldig.';
  const verlopen = /verlopen/i.test(tekst);
  const toelichting = verlopen
    ? 'Er is niets ondertekend. Vraag het Kerkje van Persingen om een nieuwe link als de reservering nog openstaat.'
    : 'Er is niets ondertekend. Open de link uit de e-mail opnieuw, of neem contact op met het Kerkje van Persingen.';
  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${esc(tekst)}</title>
</head>
<body style="margin:0;background:#FAF8F3;color:#1A1A1A;font-family:Georgia,'Times New Roman',serif;">
  <main style="max-width:36rem;margin:0 auto;padding:2.5rem 1.25rem 3rem;">
    <p style="margin:0 0 0.75rem;font-family:Arial,Helvetica,sans-serif;font-size:0.8rem;letter-spacing:0.04em;text-transform:uppercase;color:#4A5235;">Kerkje van Persingen</p>
    <h1 style="margin:0 0 1rem;font-size:1.75rem;line-height:1.2;color:#4A5235;">${esc(tekst)}</h1>
    <p style="margin:0 0 1rem;font-family:Arial,Helvetica,sans-serif;font-size:1.05rem;line-height:1.55;">${esc(toelichting)}</p>
    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:1rem;"><a href="https://kerkjepersingen.nl/" style="color:#4A5235;">www.kerkjepersingen.nl</a></p>
  </main>
</body>
</html>`;
}
