import { openai } from "@/lib/ai/openai";
import { config } from "@/lib/config";
import { conversationsRepo } from "@/lib/db/repo";
import { type Logger, errorMessage } from "@/lib/observability/logger";
import { buildMessages, buildRetrievalQuery } from "./prompt";
import { retrieve, type RetrievedChunk } from "./retrieve";

export type AnswerEvent =
  | { type: "meta"; traceId: string; conversationId: string; sources: SourceRef[] }
  | { type: "token"; content: string }
  | { type: "done"; latencyMs: number; retrievalMs: number; llmMs: number }
  | { type: "error"; message: string; traceId: string };

export interface SourceRef {
  index: number;
  title: string | null;
  location: string;
  similarity: number;
  snippet: string;
}

/**
 * Application-level RAG flow for one user turn. Yields events so the transport (SSE) stays separate:
 * persist question -> retrieve -> stream LLM answer -> persist answer with latencies/tokens.
 */
export async function* answerQuestion(params: {
  question: string;
  conversationId?: string;
  traceId: string;
  log: Logger;
}): AsyncGenerator<AnswerEvent> {
  const { question, traceId, log } = params;
  const t0 = performance.now();
  const conversationId = await conversationsRepo.ensure(params.conversationId);
  const history = await conversationsRepo.history(conversationId);
  await conversationsRepo.addMessage({ conversation_id: conversationId, role: "user", content: question, trace_id: traceId });
  log.info("chat.question", { conversation_id: conversationId, question, history_turns: history.length });

  let answer = "";
  let retrievalMs = 0;
  let llmMs = 0;
  let chunks: RetrievedChunk[] = [];
  let usage: { prompt_tokens?: number; completion_tokens?: number } | undefined;

  try {
    const tr = performance.now();
    chunks = await retrieve(buildRetrievalQuery(question, history), log);
    retrievalMs = Math.round(performance.now() - tr);

    const sources: SourceRef[] = chunks.map((c, i) => ({
      index: i + 1,
      title: c.title,
      location: c.location,
      similarity: Number(c.similarity.toFixed(3)),
      snippet: c.content.slice(0, 240),
    }));
    yield { type: "meta", traceId, conversationId, sources };

    const model = config().OPENAI_CHAT_MODEL;
    const tl = performance.now();
    const stream = await openai().chat.completions.create({
      model,
      temperature: 0.2,
      stream: true,
      stream_options: { include_usage: true },
      messages: buildMessages(question, chunks, history),
    });
    let firstTokenMs: number | null = null;
    for await (const part of stream) {
      const delta = part.choices[0]?.delta?.content;
      if (delta) {
        firstTokenMs ??= Math.round(performance.now() - tl);
        answer += delta;
        yield { type: "token", content: delta };
      }
      if (part.usage) usage = part.usage;
    }
    llmMs = Math.round(performance.now() - tl);
    log.info("openai.chat", {
      model,
      duration_ms: llmMs,
      first_token_ms: firstTokenMs,
      prompt_tokens: usage?.prompt_tokens,
      completion_tokens: usage?.completion_tokens,
      ok: true,
    });

    const latencyMs = Math.round(performance.now() - t0);
    await conversationsRepo.addMessage({
      conversation_id: conversationId,
      role: "assistant",
      content: answer,
      trace_id: traceId,
      latency_ms: latencyMs,
      retrieval_ms: retrievalMs,
      llm_ms: llmMs,
      prompt_tokens: usage?.prompt_tokens ?? null,
      completion_tokens: usage?.completion_tokens ?? null,
      sources,
    });
    log.info("chat.answer", { conversation_id: conversationId, latency_ms: latencyMs, retrieval_ms: retrievalMs, llm_ms: llmMs, chunks: chunks.length });
    yield { type: "done", latencyMs, retrievalMs, llmMs };
  } catch (err) {
    const message = errorMessage(err);
    log.error("chat.failed", { conversation_id: conversationId, error: message });
    await conversationsRepo
      .addMessage({
        conversation_id: conversationId,
        role: "assistant",
        content: answer,
        trace_id: traceId,
        error: message,
        latency_ms: Math.round(performance.now() - t0),
        retrieval_ms: retrievalMs || null,
      })
      .catch(() => undefined);
    yield { type: "error", message: "Sorry, something went wrong generating the answer.", traceId };
  }
}
