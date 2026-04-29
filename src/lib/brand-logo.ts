import type { Brand } from "@/lib/airtable/types";

type LogoFields = Pick<
  Brand,
  | "logoColorSquare"
  | "logoColorRect"
  | "logoTransparentDark"
  | "logoTransparentLight"
  | "logoRectangularLight"
  | "logoRectangularDark"
  | "logoUrl"
>;

/**
 * Pick the best available brand logo URL for the given surface.
 *
 * Priority:
 *   1. The full-color variant for the requested shape (works on either bg).
 *   2. The transparent variant suited to the surface (dark art on light bg,
 *      light art on dark bg).
 *   3. The opposite-surface transparent as a last resort.
 *   4. The legacy `logoUrl` (Airtable attachment — may have expired).
 */
export function pickBrandLogo(
  brand: LogoFields | null | undefined,
  opts: { surface?: "light" | "dark"; shape?: "square" | "rect" } = {}
): string | null {
  if (!brand) return null;
  const surface = opts.surface ?? "light";
  const shape = opts.shape ?? "square";

  const color = shape === "square" ? brand.logoColorSquare : brand.logoColorRect;

  if (shape === "rect") {
    const onSurface =
      surface === "dark" ? brand.logoRectangularDark : brand.logoRectangularLight;
    const opposite =
      surface === "dark" ? brand.logoRectangularLight : brand.logoRectangularDark;
    return color || onSurface || opposite || brand.logoUrl || null;
  }

  const onSurface =
    surface === "dark" ? brand.logoTransparentLight : brand.logoTransparentDark;
  const opposite =
    surface === "dark" ? brand.logoTransparentDark : brand.logoTransparentLight;
  return color || onSurface || opposite || brand.logoUrl || null;
}
