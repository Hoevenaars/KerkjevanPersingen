import { createHash, randomBytes } from 'node:crypto';

/** Plain token gaat één keer naar de klant. De database bewaart alleen de hash. */
export function nieuwToegangstoken(): { plain: string; hash: string } {
  const plain = randomBytes(32).toString('base64url');
  return { plain, hash: hashToegangstoken(plain) };
}

export function hashToegangstoken(plain: string): string {
  return createHash('sha256').update(plain).digest('hex');
}

export function tokenIsVerlopen(verlooptOpIso: string, nu: Date): boolean {
  return new Date(verlooptOpIso).getTime() <= nu.getTime();
}
