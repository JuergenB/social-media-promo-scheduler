/**
 * Validates the per-API throttle's correctness contract:
 *   - First call passes through immediately.
 *   - Subsequent calls within the minimum interval are delayed.
 *   - Calls separated by ≥ minimum interval pass through immediately.
 *   - Concurrent waiters serialize (no race on lastCallTime).
 */

import { describe, it, expect } from "vitest";
import { airtableThrottle, zernioThrottle, lnkBioThrottle } from "@/lib/api-throttle";

// Trade isolation for speed: we share the module-singleton throttles
// across tests, so tests must run sequentially within a describe block
// (vitest default). Each `it` does its own sequential timing assertion.

describe("api-throttle minimum interval", () => {
  it("Airtable throttle (220ms): 5 sequential calls take ≥ 4 × 220ms", async () => {
    // First call has no prior — passes through. Calls 2..5 each wait 220ms.
    // Reset by waiting 1s before the test (so any prior lastCallTime is stale).
    await new Promise((r) => setTimeout(r, 1100));

    const start = Date.now();
    for (let i = 0; i < 5; i++) await airtableThrottle.wait();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(4 * 220 - 5);
  });

  it("Zernio throttle (1100ms): 3 sequential calls take ≥ 2 × 1100ms", async () => {
    await new Promise((r) => setTimeout(r, 2300));
    const start = Date.now();
    for (let i = 0; i < 3; i++) await zernioThrottle.wait();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(2 * 1100 - 5);
  }, 10_000);

  it("lnk.bio throttle (500ms): 4 sequential calls take ≥ 3 × 500ms", async () => {
    await new Promise((r) => setTimeout(r, 1100));
    const start = Date.now();
    for (let i = 0; i < 4; i++) await lnkBioThrottle.wait();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(3 * 500 - 5);
  });

  it("concurrent waiters serialize (don't race on lastCallTime)", async () => {
    await new Promise((r) => setTimeout(r, 1100));
    // Fire 4 waits in parallel — they should still serialize under the minimum interval.
    const start = Date.now();
    await Promise.all(Array.from({ length: 4 }, () => airtableThrottle.wait()));
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(3 * 220 - 5);
  });
});
