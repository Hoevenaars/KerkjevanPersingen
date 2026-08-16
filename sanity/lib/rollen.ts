/**
 * Alleen de webmaster mag de vriendenlijst zien (AVG).
 *
 * Nelleke en overig bestuur moeten in Sanity **Editor** zijn, niet
 * Administrator. Studio-verbergen is geen echte API-ACL: GROQ-toegang tot
 * `vriend` blokkeer je pas met custom roles (Sanity Growth).
 */
export type StudioGebruiker = {
  email?: string | null
  roles?: {name: string}[]
} | null | undefined

export function isWebmaster(user: StudioGebruiker): boolean {
  if (!user) return false
  if (user.roles?.some((role) => role.name === 'administrator')) return true
  return user.email?.toLowerCase() === 'nhoevenaars@gmail.com'
}
