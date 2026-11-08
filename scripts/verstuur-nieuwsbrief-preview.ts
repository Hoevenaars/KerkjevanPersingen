const week = process.argv[2] ?? null
const adres = process.env.NIEUWSBRIEF_PREVIEW_ADRES ?? 'nhoevenaars@gmail.com'

const {datumVoorPreview, verstuurPreview} = await import('../src/lib/nieuwsbrief.ts')

await verstuurPreview(adres, datumVoorPreview(week))
console.log(`Preview verstuurd naar ${adres}${week ? ` (week ${week})` : ''}`)
