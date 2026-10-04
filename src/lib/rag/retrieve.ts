import { embedQuery } from "@/lib/ai/embeddings";
import { config } from "@/lib/config";
import { chunksRepo } from "@/lib/db/repo";
import { type Logger } from "@/lib/observability/logger";
import { type ContextChunk } from "./prompt";

export interface RetrievedChunk extends ContextChunk {
  id: string;
  sourceId: string;
}

/** Semantic search over ingested chunks (pgvector cosine similarity). */
export async function retrieve(query: string, log: Logger): Promise<RetrievedChunk[]> {
  const { RAG_MATCH_COUNT, RAG_MIN_SIMILARITY } = config();
  const embedding = await embedQuery(query, log);
  const startedAt = performance.now();
  const rows = await chunksRepo.match(embedding, RAG_MATCH_COUNT, RAG_MIN_SIMILARITY);
  log.info("rag.retrieve", {
    matches: rows.length,
    top_similarity: rows[0]?.similarity ?? null,
    duration_ms: Math.round(performance.now() - startedAt),
  });
  return rows.map((r) => ({
    id: r.id,
    sourceId: r.source_id,
    content: r.content,
    similarity: r.similarity,
    title: (r.metadata?.title as string) ?? r.source_title,
    location: (r.metadata?.location as string) ?? r.source_uri,
  }));
}
