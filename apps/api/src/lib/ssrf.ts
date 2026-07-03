/**
 * Garde anti-SSRF pour les URLs de webhook fournies par les tenants.
 * Rejette les schémas non-http(s) et les hôtes internes (loopback, RFC1918,
 * link-local, métadonnées cloud). Basé sur le hostname littéral — ne protège
 * pas d'un DNS-rebinding, mais bloque les cibles internes évidentes.
 */
export function isSafePublicUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "metadata.google.internal") {
    return false;
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = ipv4.slice(1).map(Number) as [number, number, number, number];
    if (a === 10) return false;
    if (a === 127) return false;
    if (a === 0) return false;
    if (a === 169 && b === 254) return false; // link-local + AWS/GCP metadata
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a >= 224) return false; // multicast / réservé
  }

  // IPv6 loopback / unique-local / link-local.
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) {
    return false;
  }

  return true;
}
