import { describe, expect, it } from "vitest";
import { isAuthorized } from "@/lib/auth";
import { normalizeUrl } from "@/lib/ingest/crawl";
import { htmlToText } from "@/lib/ingest/parse";
import { buildMessages, buildRetrievalQuery, formatContext } from "@/lib/rag/prompt";

describe("isAuthorized", () => {
  const token = "s3cret-token-0123456789";
  it("accepts the correct bearer token", () => expect(isAuthorized(`Bearer ${token}`, token)).toBe(true));
  it("rejects a missing header", () => expect(isAuthorized(null, token)).toBe(false));
  it("rejects a wrong token", () => expect(isAuthorized("Bearer nope", token)).toBe(false));
  it("rejects non-bearer schemes", () => expect(isAuthorized(`Basic ${token}`, token)).toBe(false));
});

describe("normalizeUrl", () => {
  it("accepts public https URLs and strips the hash", () => {
    expect(normalizeUrl("https://example.com/a#b").toString()).toBe("https://example.com/a");
  });
  it.each(["ftp://example.com", "http://localhost:3000", "http://127.0.0.1", "http://192.168.1.2", "not a url"])(
    "rejects %s",
    (u) => expect(() => normalizeUrl(u)).toThrow(),
  );
});

describe("htmlToText", () => {
  it("extracts headings/paragraphs, drops scripts and nav, collects links", () => {
    const html = `<html><head><title>Acme</title><script>evil()</script></head>
      <body><nav>Menu</nav><main><h1>About</h1><p>We sell rockets.</p><a href="/pricing">Pricing</a></main></body></html>`;
    const { title, text, links } = htmlToText(html);
    expect(title).toBe("Acme");
    expect(text).toContain("# About");
    expect(text).toContain("We sell rockets.");
    expect(text).not.toContain("evil");
    expect(text).not.toContain("Menu");
    expect(links).toContain("/pricing");
  });
});

describe("prompt", () => {
  const chunks = [{ content: "Plan costs $10.", title: "Pricing", location: "https://x.com/pricing", similarity: 0.8 }];
  it("numbers context passages for citation", () => {
    expect(formatContext(chunks)).toContain("[1] (source: Pricing — https://x.com/pricing)");
  });
  it("puts system prompt first, history, then the question with context", () => {
    const msgs = buildMessages("How much?", chunks, [{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }]);
    expect(msgs[0].role).toBe("system");
    expect(msgs).toHaveLength(4);
    expect(msgs[3].content).toContain("Question: How much?");
  });
  it("handles no context", () => expect(formatContext([])).toMatch(/No relevant context/));
  it("enriches short follow-ups with the previous user question", () => {
    expect(buildRetrievalQuery("and pricing?", [{ role: "user", content: "Tell me about plan A" }])).toContain("plan A");
  });
});
