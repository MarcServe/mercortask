import { db } from "./client";

/** Thin data-access layer: all SQL/table knowledge lives here. */

export interface SourceRow {
  id: string;
  type: "url" | "file";
  uri: string;
  title: string | null;
  status: "pending" | "processing" | "ready" | "failed";
  chunk_count: number;
  error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface MatchedChunk {
  id: string;
  source_id: string;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
  source_uri: string;
  source_title: string | null;
}

function check<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

export const sourcesRepo = {
  async create(input: { type: "url" | "file"; uri: string; title?: string }) {
    return check<SourceRow>(
      await db().from("asmt_sources").insert({ ...input, status: "processing" }).select().single(),
      "create source",
    );
  },
  async update(id: string, patch: Partial<Pick<SourceRow, "status" | "chunk_count" | "error" | "title" | "metadata">>) {
    check(await db().from("asmt_sources").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id), "update source");
  },
  async list() {
    return check<SourceRow[]>(
      await db().from("asmt_sources").select("*").order("created_at", { ascending: false }).limit(200),
      "list sources",
    );
  },
  async remove(id: string) {
    const rows = check<{ id: string }[]>(await db().from("asmt_sources").delete().eq("id", id).select("id"), "delete source");
    return rows.length > 0;
  },
};

export const chunksRepo = {
  async insertMany(
    rows: { source_id: string; chunk_index: number; content: string; token_count: number; metadata: object; embedding: number[] }[],
  ) {
    for (let i = 0; i < rows.length; i += 200) {
      const batch = rows.slice(i, i + 200).map((r) => ({ ...r, embedding: JSON.stringify(r.embedding) }));
      check(await db().from("asmt_chunks").insert(batch), "insert chunks");
    }
  },
  async match(embedding: number[], matchCount: number, minSimilarity: number) {
    return check<MatchedChunk[]>(
      await db().rpc("asmt_match_chunks", {
        query_embedding: JSON.stringify(embedding),
        match_count: matchCount,
        min_similarity: minSimilarity,
      }),
      "match chunks",
    );
  },
};

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  trace_id: string;
  latency_ms: number | null;
  retrieval_ms: number | null;
  llm_ms: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  sources: unknown[];
  error: string | null;
  created_at: string;
}

export const conversationsRepo = {
  /** Returns the conversation id, creating one if it does not exist. */
  async ensure(id?: string) {
    if (id) {
      const existing = check<{ id: string }[]>(await db().from("asmt_conversations").select("id").eq("id", id), "get conversation");
      if (existing.length) return id;
    }
    return check<{ id: string }>(await db().from("asmt_conversations").insert({}).select("id").single(), "create conversation").id;
  },
  async history(conversationId: string, limit = 8) {
    const rows = check<Pick<MessageRow, "role" | "content">[]>(
      await db()
        .from("asmt_messages")
        .select("role, content")
        .eq("conversation_id", conversationId)
        .is("error", null)
        .order("created_at", { ascending: false })
        .limit(limit),
      "conversation history",
    );
    return rows.reverse();
  },
  async addMessage(msg: Omit<MessageRow, "id" | "created_at" | "sources" | "error" | "latency_ms" | "retrieval_ms" | "llm_ms" | "prompt_tokens" | "completion_tokens"> & Partial<MessageRow>) {
    check(await db().from("asmt_messages").insert(msg), "insert message");
    check(
      await db().from("asmt_conversations").update({ last_message_at: new Date().toISOString() }).eq("id", msg.conversation_id),
      "touch conversation",
    );
  },
  async recent(limit = 50) {
    const convs = check<{ id: string; created_at: string; last_message_at: string }[]>(
      await db().from("asmt_conversations").select("*").order("last_message_at", { ascending: false }).limit(limit),
      "list conversations",
    );
    if (!convs.length) return [];
    const msgs = check<MessageRow[]>(
      await db()
        .from("asmt_messages")
        .select("*")
        .in("conversation_id", convs.map((c) => c.id))
        .order("created_at", { ascending: true }),
      "list messages",
    );
    return convs.map((c) => ({ ...c, messages: msgs.filter((m) => m.conversation_id === c.id) }));
  },
};

export interface LogRow {
  id: number;
  ts: string;
  level: string;
  trace_id: string | null;
  route: string | null;
  event: string;
  data: Record<string, unknown>;
}

export const logsRepo = {
  async query(filter: { traceId?: string; level?: string; event?: string; limit?: number }) {
    let q = db().from("asmt_logs").select("*").order("ts", { ascending: false }).limit(filter.limit ?? 200);
    if (filter.traceId) q = q.eq("trace_id", filter.traceId);
    if (filter.level) q = q.eq("level", filter.level);
    if (filter.event) q = q.ilike("event", `${filter.event}%`);
    return check<LogRow[]>(await q, "query logs");
  },
};
