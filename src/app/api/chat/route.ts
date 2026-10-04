import { z } from "zod";
import { badRequest } from "@/lib/errors";
import { withApi } from "@/lib/observability/handler";
import { answerQuestion } from "@/lib/rag/answer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const body = z.object({
  message: z.string().trim().min(1).max(2000),
  conversationId: z.string().uuid().optional(),
});

/**
 * Streams the answer as Server-Sent Events:
 *   event: meta  -> { traceId, conversationId, sources[] }
 *   event: token -> { content }            (repeated)
 *   event: done  -> { latencyMs, retrievalMs, llmMs }
 *   event: error -> { message, traceId }
 */
export const POST = withApi("POST /api/chat", async (req, { traceId, log }) => {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw badRequest('Body must be JSON: { "message": string, "conversationId"?: uuid }');

  const encoder = new TextEncoder();
  const events = answerQuestion({ ...parsed.data, question: parsed.data.message, traceId, log });

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await events.next();
      if (done) return controller.close();
      const { type, ...data } = value;
      controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`));
    },
    async cancel() {
      log.warn("chat.client_disconnected");
      await events.return(undefined);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
});
