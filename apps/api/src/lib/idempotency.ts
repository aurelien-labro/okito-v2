/**
 * Cache d'idempotency in-memory pour les endpoints POST.
 *
 * Usage : client envoie `Idempotency-Key: <uuid>` sur une mutation. Si le
 * client retry (réseau coupé, timeout côté Vapi/WhatsApp), il renvoie la
 * même clé. On retourne la réponse mise en cache au lieu de re-créer.
 *
 * Limite assumée : in-process. Si plusieurs instances API tournent, la clé
 * n'est pas partagée — risque de doublon. Pour ce stade c'est OK (1 process
 * Fly.io), à remplacer par Redis si on scale horizontalement.
 *
 * Scopé par `tenantId` + `key` pour éviter qu'un tenant lise la réponse
 * d'un autre.
 */

export interface CachedResponse {
  status: number;
  body: unknown;
}

interface Entry {
  value: CachedResponse;
  expiresAt: number;
}

export class IdempotencyCache {
  private readonly store = new Map<string, Entry>();
  private readonly ttlMs: number;
  private readonly maxSize: number;

  constructor(opts?: { ttlMs?: number; maxSize?: number }) {
    this.ttlMs = opts?.ttlMs ?? 24 * 60 * 60 * 1000; // 24h
    this.maxSize = opts?.maxSize ?? 10_000;
  }

  get(tenantId: string, key: string): CachedResponse | null {
    const k = `${tenantId}::${key}`;
    const entry = this.store.get(k);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.store.delete(k);
      return null;
    }
    return entry.value;
  }

  set(tenantId: string, key: string, value: CachedResponse): void {
    const k = `${tenantId}::${key}`;
    if (this.store.size >= this.maxSize) this.evictOldest();
    this.store.set(k, { value, expiresAt: Date.now() + this.ttlMs });
  }

  /** Pour les tests. */
  clear(): void {
    this.store.clear();
  }

  private evictOldest(): void {
    // Map garde l'ordre d'insertion → le premier est le plus ancien.
    const firstKey = this.store.keys().next().value;
    if (firstKey !== undefined) this.store.delete(firstKey);
  }
}
