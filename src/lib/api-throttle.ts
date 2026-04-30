/**
 * Per-external-API minimum-interval throttle. Guarantees a hard floor
 * between successive calls to one API regardless of caller pattern, so
 * batch routes (redistribute, schedule, generate) cannot blow through
 * provider rate limits.
 *
 * Scope: per Node.js module instance. Within a single Vercel function
 * invocation this is a hard guarantee. Across concurrent invocations
 * (e.g., two users hitting redistribute simultaneously) each lambda
 * has its own tracker — for that case, the per-client retry-on-429
 * logic absorbs collisions.
 *
 * Concurrency-safe within a single invocation via a serial wait chain:
 * concurrent `wait()` calls queue, they don't race on `lastCallTime`.
 */
class ApiThrottle {
  private lastCallTime = 0;
  private waitChain: Promise<void> = Promise.resolve();

  constructor(private readonly minIntervalMs: number) {}

  async wait(): Promise<void> {
    const myTurn = this.waitChain.then(async () => {
      const now = Date.now();
      const elapsed = now - this.lastCallTime;
      if (elapsed < this.minIntervalMs) {
        await new Promise<void>((r) => setTimeout(r, this.minIntervalMs - elapsed));
      }
      this.lastCallTime = Date.now();
    });
    // Never let the chain reject (a thrown error mid-wait would poison it).
    this.waitChain = myTurn.catch(() => undefined);
    return myTurn;
  }
}

// ── Configured limiters per API ──────────────────────────────────────
//
// Numbers chosen to stay strictly under documented limits with margin.
// They add latency proportional to call count; that's the explicit
// trade-off — guaranteed safety over speed.

/** Airtable: 5 req/sec per base. 220ms = 4.5 req/sec → safe. */
export const airtableThrottle = new ApiThrottle(220);

/**
 * Zernio: Free tier 60/min (1/sec), Build tier 120/min (2/sec). We don't
 * know which tier the deployed key is on, so target the Free tier with
 * margin: 1100ms = ~0.9 req/sec → safe under Free.
 */
export const zernioThrottle = new ApiThrottle(1100);

/**
 * lnk.bio: rate limit undocumented; the dashboard is responsive at ~2 req/sec
 * in practice. 500ms = 2 req/sec is a conservative ceiling.
 */
export const lnkBioThrottle = new ApiThrottle(500);
