const PAD = /^\/[a-z0-9/_-]*$/;

/** Publiek pad zonder query, hash of traversal. Null als het niet veilig opgeslagen kan worden. */
export function normaliseerPad(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const zonderQuery = pathname.split('?')[0]?.split('#')[0] ?? '';
  if (!zonderQuery.startsWith('/')) return null;
  if (zonderQuery.length > 300) return null;
  if (zonderQuery.includes('\\') || zonderQuery.includes('\0') || zonderQuery.includes('..')) return null;

  let pad = zonderQuery;
  if (pad.length > 1 && pad.endsWith('/')) pad = pad.slice(0, -1);
  if (!PAD.test(pad)) return null;
  if (pad !== '/' && pad.split('/').slice(1).some((deel) => deel.length === 0)) return null;
  return pad;
}
