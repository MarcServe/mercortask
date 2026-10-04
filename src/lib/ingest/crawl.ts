import { badRequest } from "@/lib/errors";
import { type Logger, errorMessage } from "@/lib/observability/logger";
import { htmlToText } from "./parse";

export interface CrawledPage {
  url: string;
  title: string;
  text: string;
}

const USER_AGENT = "RAG-Assistant-Crawler/1.0 (+assessment demo)";
const FETCH_TIMEOUT_MS = 15_000;
const SKIP_EXT = /\.(png|jpe?g|gif|svg|webp|ico|css|js|json|xml|zip|gz|mp4|mp3|woff2?|ttf|pdf)(\?|$)/i;

/** Validate and normalise a user-supplied URL; blocks non-http(s) and obvious internal hosts (SSRF guard). */
export function normalizeUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw badRequest("Invalid URL");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw badRequest("Only http(s) URLs are supported");
  const host = url.hostname;
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === "[::1]"
  ) {
    throw badRequest("Private or local addresses are not allowed");
  }
  url.hash = "";
  return url;
}

/**
 * Breadth-first crawl of same-origin pages starting at `startUrl`, up to `maxPages`.
 * Static HTML only (no JS rendering) — documented trade-off in the README.
 */
export async function crawlSite(startUrl: string, maxPages: number, log: Logger): Promise<CrawledPage[]> {
  const start = normalizeUrl(startUrl);
  const queue: string[] = [start.toString()];
  const seen = new Set(queue);
  const pages: CrawledPage[] = [];

  while (queue.length && pages.length < maxPages) {
    const url = queue.shift()!;
    const startedAt = performance.now();
    try {
      const res = await fetch(url, {
        headers: { "user-agent": USER_AGENT, accept: "text/html" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: "follow",
      });
      const duration_ms = Math.round(performance.now() - startedAt);
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || !type.includes("text/html")) {
        log.warn("crawl.skip", { url, status: res.status, content_type: type, duration_ms });
        continue;
      }
      const { title, text, links } = htmlToText(await res.text());
      log.info("crawl.page", { url, status: res.status, chars: text.length, duration_ms });
      if (text.length > 50) pages.push({ url, title: title || url, text });

      for (const href of links) {
        try {
          const next = new URL(href, url);
          next.hash = "";
          const key = next.toString();
          if (next.origin === start.origin && !seen.has(key) && !SKIP_EXT.test(next.pathname)) {
            seen.add(key);
            queue.push(key);
          }
        } catch {
          /* ignore malformed links */
        }
      }
    } catch (err) {
      log.warn("crawl.fetch_failed", { url, error: errorMessage(err) });
    }
  }

  if (!pages.length) throw badRequest("No readable HTML content found at that URL");
  return pages;
}
