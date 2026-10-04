import * as cheerio from "cheerio";
import { config } from "@/lib/config";
import { badRequest, upstream } from "@/lib/errors";
import { type Logger, errorMessage, timed } from "@/lib/observability/logger";

export interface ParsedDocument {
  title: string;
  text: string;
  metadata?: Record<string, unknown>;
}

/** File types accepted by the shared `parse-document` edge function. */
export const SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt", ".txt", ".md", ".json", ".csv", ".rtf"] as const;

const PARSE_TIMEOUT_MS = 280_000; // large PDFs are extracted by OpenAI inside the edge function

interface ParseDocumentResponse {
  pages?: { url: string; title: string; content: string; headings: string[] }[];
  metadata?: Record<string, unknown>;
  error?: string;
  details?: string;
}

/**
 * Extracts text from an uploaded file by delegating to the existing Supabase edge function
 * `parse-document` (shared with TalkWeb). It already handles PDF (OpenAI-based extraction, incl. scanned
 * documents), DOCX, XLSX, PPTX, CSV, JSON, RTF, TXT and MD, so this app doesn't duplicate parsers.
 */
export async function parseFile(filename: string, buffer: Buffer, log: Logger): Promise<ParsedDocument> {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  if (!(SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)) {
    throw badRequest(`Unsupported file type "${ext}". Supported: ${SUPPORTED_EXTENSIONS.join(", ")}`);
  }
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = config();
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)]), filename);

  let body: ParseDocumentResponse;
  let status: number;
  try {
    const { result } = await timed(
      log,
      "edge.parse_document",
      async () => {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/parse-document`, {
          method: "POST",
          headers: { authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, apikey: SUPABASE_SERVICE_ROLE_KEY },
          body: form,
          signal: AbortSignal.timeout(PARSE_TIMEOUT_MS),
        });
        return { status: res.status, body: (await res.json().catch(() => ({}))) as ParseDocumentResponse };
      },
      { filename, bytes: buffer.length },
    );
    ({ status, body } = result);
  } catch (err) {
    throw upstream(`Document parsing service unavailable: ${errorMessage(err)}`);
  }

  if (status === 400) throw badRequest(body.error ?? "Document could not be parsed");
  if (status >= 300 || !body.pages?.length) throw upstream(body.error ?? `Document parsing failed (HTTP ${status})`);

  const text = body.pages.map((p) => p.content).join("\n\n");
  return { title: body.pages[0].title || filename, text, metadata: body.metadata };
}

/** Convert an HTML page into clean text, keeping headings/paragraphs as separate blocks. */
export function htmlToText(html: string): ParsedDocument & { links: string[] } {
  const $ = cheerio.load(html);
  const links = $("a[href]")
    .map((_, el) => $(el).attr("href") ?? "")
    .get()
    .filter(Boolean);

  $("script, style, noscript, svg, iframe, nav, footer, header, form, [aria-hidden='true']").remove();
  const title = $("title").first().text().trim() || $("h1").first().text().trim();
  const root = $("main").length ? $("main") : $("article").length ? $("article") : $("body");

  const blocks: string[] = [];
  root.find("h1, h2, h3, h4, h5, h6, p, li, td, th, blockquote, pre, dt, dd").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (!t) return;
    const tag = (el as { tagName?: string }).tagName?.toLowerCase() ?? "";
    blocks.push(/^h[1-6]$/.test(tag) ? `# ${t}` : tag === "li" ? `- ${t}` : t);
  });
  // Fallback for pages built mostly from divs/spans.
  const text = blocks.length ? dedupe(blocks).join("\n\n") : root.text().replace(/\s+/g, " ").trim();
  return { title, text, links };
}

function dedupe(blocks: string[]): string[] {
  const seen = new Set<string>();
  return blocks.filter((b) => (seen.has(b) ? false : (seen.add(b), true)));
}
