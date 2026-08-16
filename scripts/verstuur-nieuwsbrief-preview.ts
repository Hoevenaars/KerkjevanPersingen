process.env.SANITY_PROJECT_ID ??= '8le5jso9'
process.env.SANITY_DATASET ??= 'production'

const week = process.argv[2] ?? null
const adres = process.env.NIEUWSBRIEF_PREVIEW_ADRES ?? 'nhoevenaars@gmail.com'

const {datumVoorPreview, verstuurPreview} = await import('../src/lib/nieuwsbrief.ts')

await verstuurPreview(adres, datumVoorPreview(week))
console.log(`Preview verstuurd naar ${adres}${week ? ` (week ${week})` : ''}`)
