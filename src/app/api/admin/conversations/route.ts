import { NextResponse } from "next/server";
import { conversationsRepo } from "@/lib/db/repo";
import { withApi } from "@/lib/observability/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

/** Chat transcripts with per-message latency, plus aggregate latency/error stats. */
export const GET = withApi("GET /api/admin/conversations", async (req) => {
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 50) || 50, 200);
  const conversations = await conversationsRepo.recent(limit);
  const answers = conversations.flatMap((c) => c.messages.filter((m) => m.role === "assistant"));
  const latencies = answers.filter((m) => !m.error && m.latency_ms != null).map((m) => m.latency_ms!);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

  return NextResponse.json({
    stats: {
      conversations: conversations.length,
      questions: conversations.flatMap((c) => c.messages).filter((m) => m.role === "user").length,
      answers: answers.length,
      errors: answers.filter((m) => m.error).length,
      latency_ms: { avg: avg(latencies), p50: percentile(latencies, 50), p95: percentile(latencies, 95) },
      avg_retrieval_ms: avg(answers.filter((m) => m.retrieval_ms != null).map((m) => m.retrieval_ms!)),
      avg_llm_ms: avg(answers.filter((m) => m.llm_ms != null).map((m) => m.llm_ms!)),
    },
    conversations,
  });
});
