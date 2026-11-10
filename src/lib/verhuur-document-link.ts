/**
 * Korte, privé-link naar een boekingsdocument.
 * Gebruikt de ingelogde sessie. Geen service-role.
 */

interface Ondertekenaar {
  storage: {
    from: (bucket: string) => {
      createSignedUrl: (
        pad: string,
        seconden: number,
      ) => Promise<{ data: { signedUrl?: string } | null; error: { message: string } | null }>;
    };
  };
}

export async function documentLinks(
  client: unknown,
  documenten: readonly { id: string; pad?: string }[],
): Promise<Record<string, string>> {
  const uit: Record<string, string> = {};
  if (!client || typeof client !== 'object' || !('storage' in client)) return uit;
  const storage = (client as Ondertekenaar).storage;
  if (!storage?.from) return uit;
  for (const document of documenten) {
    const pad = document.pad?.trim();
    if (!pad || pad.startsWith('handmatig:')) continue;
    try {
      const antwoord = await storage.from('booking-documents').createSignedUrl(pad, 600);
      const url = antwoord.data?.signedUrl ?? '';
      if (url.startsWith('https://') || url.startsWith('http://')) uit[document.id] = url;
    } catch {
      continue;
    }
  }
  return uit;
}
