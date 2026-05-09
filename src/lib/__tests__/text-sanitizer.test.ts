/**
 * Validates stripMarkdownFormatting's curly-quote conversion contract:
 *   - Italic and bold markdown converted to curly quotes (U+201C / U+201D)
 *   - snake_case identifiers and hashtags untouched (negative cases)
 *   - Idempotent on already-sanitized strings
 *   - Null-safe on empty input
 *
 * Related: issue #222.
 */

import { describe, it, expect } from "vitest";
import { stripMarkdownFormatting } from "@/lib/text-sanitizer";

describe("stripMarkdownFormatting", () => {
  it("converts _italic_ to curly quotes", () => {
    expect(stripMarkdownFormatting("Wesley Goatley's _The Harbinger_ is about what it hears."))
      .toBe("Wesley Goatley's “The Harbinger” is about what it hears.");
  });

  it("converts *italic* to curly quotes", () => {
    expect(stripMarkdownFormatting("This is *emphasized* text"))
      .toBe("This is “emphasized” text");
  });

  it("converts **bold** to curly quotes", () => {
    expect(stripMarkdownFormatting("Read **The Harbinger** today"))
      .toBe("Read “The Harbinger” today");
  });

  it("converts __bold__ to curly quotes", () => {
    expect(stripMarkdownFormatting("Check out __this title__"))
      .toBe("Check out “this title”");
  });

  it("handles mixed bold and italic in one string", () => {
    expect(stripMarkdownFormatting("**Bold** and _italic_ together"))
      .toBe("“Bold” and “italic” together");
  });

  it("does NOT touch snake_case identifiers", () => {
    expect(stripMarkdownFormatting("my_variable_name should stay intact"))
      .toBe("my_variable_name should stay intact");
  });

  it("does NOT break hashtags with underscores", () => {
    expect(stripMarkdownFormatting("Use #some_tag and #my_other_tag"))
      .toBe("Use #some_tag and #my_other_tag");
  });

  it("does NOT touch asterisks inside tokens", () => {
    expect(stripMarkdownFormatting("globs use *.ts patterns"))
      .toBe("globs use *.ts patterns");
  });

  it("returns empty string unchanged", () => {
    expect(stripMarkdownFormatting("")).toBe("");
  });

  it("is null-safe on null/undefined input", () => {
    // @ts-expect-error — exercising runtime null guard
    expect(stripMarkdownFormatting(null)).toBe(null);
    // @ts-expect-error — exercising runtime undefined guard
    expect(stripMarkdownFormatting(undefined)).toBe(undefined);
  });

  it("preserves emojis and unicode", () => {
    expect(stripMarkdownFormatting("_The Harbinger_ is about what it hears. 👂"))
      .toBe("“The Harbinger” is about what it hears. 👂");
  });

  it("does not touch markdown links, headings, or inline code", () => {
    const input = "# Heading\n[text](url) and `code` should stay";
    expect(stripMarkdownFormatting(input)).toBe(input);
  });

  it("handles multiple italic spans on the same line", () => {
    expect(stripMarkdownFormatting("Reading _Book One_ before _Book Two_"))
      .toBe("Reading “Book One” before “Book Two”");
  });
});
