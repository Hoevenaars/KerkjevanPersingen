const week = process.argv[2] ?? null
const adres = process.env.NIEUWSBRIEF_PREVIEW_ADRES ?? 'nhoevenaars@gmail.com'

const { datumVoorPreview, verstuurPreview } = await import('../src/lib/nieuwsbrief.ts')

const uit = await verstuurPreview(adres, datumVoorPreview(week))
console.log(`Preview niet verzonden (${uit.overgeslagen}). Onderwerp: ${uit.onderwerp || 'geen'}`)

export {}
