/**
 * Strip markdown italic/bold formatting from social post text and replace
 * with curly quotes. Used for content destined for platforms that don't
 * render markdown (Instagram, X, Facebook, Threads, Bluesky, Pinterest,
 * and even LinkedIn for the underscore variant).
 *
 * Scope is intentionally narrow — italic + bold only. Headings (#),
 * inline code (`), and links ([text](url)) are not touched.
 *
 * Negative lookbehind/lookahead avoid false-positives on snake_case
 * identifiers, hashtags, and asterisks inside tokens.
 *
 * Related: issue #222.
 */
export function stripMarkdownFormatting(text: string): string {
  if (!text) return text;
  return text
    // **bold** and __bold__ first (greedy markers run before italic so
    // we don't mis-handle e.g. "**foo**" as nested italic.
    .replace(/\*\*([^*\n]+)\*\*/g, "“$1”")
    .replace(/(?<!\w)__([^_\n]+)__(?!\w)/g, "“$1”")
    // _italic_ — bounded by non-word chars to avoid snake_case.
    .replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, "“$1”")
    // *italic* — same boundary rule.
    .replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, "“$1”");
}
