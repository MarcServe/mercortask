import { embedTexts } from "@/lib/ai/embeddings";
import { badRequest } from "@/lib/errors";
import { chunksRepo, sourcesRepo, type SourceRow } from "@/lib/db/repo";
import { type Logger, errorMessage } from "@/lib/observability/logger";
import { chunkText } from "./chunk";

export interface IngestDocument {
  /** URL of the page (for crawled sites) or filename (for uploads), used for citations. */
  location: string;
  title: string;
  text: string;
}

/**
 * Shared ingestion pipeline: chunk -> embed -> store, with status tracking on the source row.
 * The source row moves processing -> ready | failed so the UI and admin can see progress/failures.
 */
export async function ingestDocuments(
  source: { type: "url" | "file"; uri: string; title: string },
  load: () => Promise<IngestDocument[]>,
  log: Logger,
): Promise<SourceRow> {
  const row = await sourcesRepo.create(source);
  log.info("ingest.start", { source_id: row.id, type: source.type, uri: source.uri });
  const startedAt = performance.now();

  try {
    const docs = await load();
    const chunks = docs.flatMap((doc) =>
      chunkText(doc.text).map((c) => ({
        content: c.content,
        token_count: c.tokenCount,
        metadata: { location: doc.location, title: doc.title, heading: c.heading ?? null },
      })),
    );
    if (!chunks.length) throw badRequest("No extractable text found in the source");
    log.info("ingest.chunked", { source_id: row.id, documents: docs.length, chunks: chunks.length });

    const embeddings = await embedTexts(
      chunks.map((c) => c.content),
      log,
    );
    await chunksRepo.insertMany(
      chunks.map((c, i) => ({ ...c, source_id: row.id, chunk_index: i, embedding: embeddings[i] })),
    );

    const done = { status: "ready" as const, chunk_count: chunks.length, metadata: { documents: docs.length } };
    await sourcesRepo.update(row.id, done);
    log.info("ingest.complete", {
      source_id: row.id,
      chunks: chunks.length,
      documents: docs.length,
      duration_ms: Math.round(performance.now() - startedAt),
    });
    return { ...row, ...done };
  } catch (err) {
    await sourcesRepo.update(row.id, { status: "failed", error: errorMessage(err) }).catch(() => undefined);
    log.error("ingest.failed", { source_id: row.id, error: errorMessage(err) });
    throw err;
  }
}
