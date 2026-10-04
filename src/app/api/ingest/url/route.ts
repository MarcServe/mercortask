import { NextResponse } from "next/server";
import { z } from "zod";
import { config } from "@/lib/config";
import { badRequest } from "@/lib/errors";
import { crawlSite, normalizeUrl } from "@/lib/ingest/crawl";
import { ingestDocuments } from "@/lib/ingest/pipeline";
import { withApi } from "@/lib/observability/handler";

export const runtime = "nodejs";
export const maxDuration = 300;

const body = z.object({
  url: z.string().min(1),
  maxPages: z.coerce.number().int().min(1).max(100).optional(),
});

export const POST = withApi("POST /api/ingest/url", async (req, { log }) => {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw badRequest('Body must be JSON: { "url": string, "maxPages"?: number }');

  const url = normalizeUrl(parsed.data.url).toString();
  const maxPages = Math.min(parsed.data.maxPages ?? config().CRAWL_MAX_PAGES, config().CRAWL_MAX_PAGES);

  const source = await ingestDocuments(
    { type: "url", uri: url, title: new URL(url).hostname },
    async () => (await crawlSite(url, maxPages, log)).map((p) => ({ location: p.url, title: p.title, text: p.text })),
    log,
  );
  return NextResponse.json({ source }, { status: 201 });
});
