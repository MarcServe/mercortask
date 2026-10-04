import { describe, expect, it } from "vitest";
import { chunkText, estimateTokens, normalizeText } from "@/lib/ingest/chunk";

describe("chunkText", () => {
  it("returns no chunks for empty input", () => {
    expect(chunkText("   \n\n ")).toEqual([]);
  });

  it("keeps small documents in a single chunk", () => {
    const chunks = chunkText("# Pricing\n\nThe basic plan costs $10 per month.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toContain("$10");
    expect(chunks[0].heading).toBe("Pricing");
  });

  it("splits long text under the token budget with sequential indexes", () => {
    const para = "This is a sentence about the product. ".repeat(40);
    const text = Array.from({ length: 6 }, (_, i) => `# Section ${i}\n\n${para}`).join("\n\n");
    const chunks = chunkText(text, { maxTokens: 300, overlapTokens: 30 });
    expect(chunks.length).toBeGreaterThan(3);
    chunks.forEach((c, i) => {
      expect(c.index).toBe(i);
      expect(c.tokenCount).toBeLessThanOrEqual(300 + 40); // budget + heading/overlap slack
    });
  });

  it("hard-splits text with no sentence punctuation", () => {
    const chunks = chunkText("a".repeat(10_000), { maxTokens: 200, overlapTokens: 0 });
    expect(chunks.length).toBeGreaterThanOrEqual(12);
    expect(chunks.every((c) => estimateTokens(c.content) <= 200)).toBe(true);
  });

  it("does not emit a trailing chunk that is only overlap", () => {
    const text = "One sentence here. ".repeat(100);
    const chunks = chunkText(text, { maxTokens: 200, overlapTokens: 50 });
    const last = chunks.at(-1)!;
    expect(last.content.length).toBeGreaterThan(50 * 4);
  });
});

describe("normalizeText", () => {
  it("collapses whitespace but keeps paragraph breaks", () => {
    expect(normalizeText("a   b\r\n\r\n\r\n\nc")).toBe("a b\n\nc");
  });
});
