/**
 * Rate limiter in-memory à fenêtre glissante.
 *
 * Compte le nombre de hits par clé dans une fenêtre `windowMs`. Si on dépasse
 * `limit`, on bloque. La fenêtre est glissante (pas par minute civile) pour
 * éviter les rafales sur la borne.
 *
 * Limite : in-process. Pour multi-instance, Redis avec `INCR + EXPIRE` ou un
 * vrai service (Upstash, Cloudflare). OK pour Fly.io 1-instance.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, number[]>();
  private readonly maxKeys: number;

  constructor(opts?: { maxKeys?: number }) {
    this.maxKeys = opts?.maxKeys ?? 50_000;
  }

  /**
   * @returns `{ allowed: true }` si la requête passe (hit comptabilisé),
   *          `{ allowed: false, retryAfterMs }` si bloquée.
   */
  hit(key: string, limit: number, windowMs: number): RateResult {
    const now = Date.now();
    const cutoff = now - windowMs;
    const hits = this.buckets.get(key) ?? [];

    // Purge les hits hors fenêtre — opération O(n) sur le bucket, mais n
    // reste petit puisqu'on évince au prochain hit.
    const recent = hits.filter((t) => t > cutoff);

    if (recent.length >= limit) {
      const oldest = recent[0] ?? now;
      return { allowed: false, retryAfterMs: Math.max(0, oldest + windowMs - now) };
    }

    recent.push(now);
    if (this.buckets.size >= this.maxKeys && !this.buckets.has(key)) {
      this.evictOldest();
    }
    this.buckets.set(key, recent);
    return { allowed: true };
  }

  /** Pour les tests. */
  clear(): void {
    this.buckets.clear();
  }

  private evictOldest(): void {
    const firstKey = this.buckets.keys().next().value;
    if (firstKey !== undefined) this.buckets.delete(firstKey);
  }
}

export type RateResult = { allowed: true } | { allowed: false; retryAfterMs: number };
