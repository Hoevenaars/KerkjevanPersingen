# Kerkje van Persingen — preview-landingspagina

Statische site, klaar om direct in Vercel te draaien. Geen build-stap nodig.

## Inhoud
- `index.html` — de pagina zelf, met wachtwoordscherm
- `public/logo.png` — het logo (los bestand, niet ingebakken als base64)
- `vercel.json` — minimale statische configuratie

Wachtwoord: `Kerkje2026`

## Deployen — twee manieren

### 1. Drag & drop (snelst, geen account-koppeling nodig)
1. Ga naar https://vercel.com/new
2. Sleep deze hele map (uitgepakt) in het upload-vlak.
3. Klaar — Vercel herkent het als statische site.

### 2. Via de Vercel CLI
```bash
npm i -g vercel
cd kerkje-vercel
vercel --prod
```
Volg de prompts (login, project-naam kiezen). Bij "Directory" gewoon de huidige map (`.`) aanhouden — er is geen framework/build-stap.

### 3. Via GitHub (voor herhaald gebruik)
1. Zet deze map in een nieuwe GitHub-repo.
2. In Vercel: "Add New… → Project" → koppel de repo.
3. Framework preset: "Other" / "Static". Geen build command nodig, output directory = root.

## Let op
Het wachtwoordscherm is een lichte drempel voor een preview, geen echte beveiliging — de check gebeurt in de browser (JavaScript), dus het wachtwoord staat leesbaar in de broncode. Voldoende om willekeurige bezoekers te weren, niet om gevoelige informatie te beschermen.
