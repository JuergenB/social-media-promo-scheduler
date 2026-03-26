/**
 * Zernio (Late) API client — per-brand key resolution
 *
 * Supports per-brand configuration: each brand can have its own Zernio API key.
 * Brand config pattern (same as Short.io):
 *   - Brand.zernioApiKeyLabel → "LATE_API_KEY_INTERSECT" → resolves to env var value
 *   - Falls back to global LATE_API_KEY env var
 */

import Late from "@getlatedev/node";

/**
 * Resolve the Zernio API key for a brand.
 * Brand-specific key label → env var → global fallback.
 */
export function resolveZernioKey(brand?: {
  zernioApiKeyLabel?: string | null;
}): string {
  const apiKey = brand?.zernioApiKeyLabel
    ? process.env[brand.zernioApiKeyLabel] || process.env.LATE_API_KEY
    : process.env.LATE_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Zernio API key not configured (set LATE_API_KEY or brand-specific key)"
    );
  }

  return apiKey;
}

/**
 * Create a Late client instance with an explicit API key.
 * For client-side usage or when you already have the key.
 */
export function createLateClient(apiKey?: string): Late {
  const key = apiKey || process.env.LATE_API_KEY;

  if (!key) {
    throw new Error(
      "Zernio API key is required. Set LATE_API_KEY environment variable or pass it explicitly."
    );
  }

  return new Late({
    apiKey: key,
  });
}

/**
 * Create a Late client for a specific brand.
 * Resolves the API key from the brand's env var label, falling back to global.
 */
export function createBrandClient(brand?: {
  zernioApiKeyLabel?: string | null;
}): Late {
  const apiKey = resolveZernioKey(brand);
  return new Late({ apiKey });
}

/**
 * @deprecated Use createBrandClient(brand) for per-brand key resolution.
 * This singleton caches a single key and does not support multi-brand.
 */
let serverClient: Late | null = null;

export function getServerClient(): Late {
  if (!serverClient) {
    serverClient = createLateClient();
  }
  return serverClient;
}
