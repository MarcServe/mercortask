"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/components/api";
import { AnswerText } from "@/components/AnswerText";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  trace_id: string;
  latency_ms: number | null;
  retrieval_ms: number | null;
  llm_ms: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  error: string | null;
  sources: unknown[];
  created_at: string;
}
interface Conversation {
  id: string;
  last_message_at: string;
  messages: Message[];
}
interface Stats {
  conversations: number;
  questions: number;
  answers: number;
  errors: number;
  latency_ms: { avg: number | null; p50: number | null; p95: number | null };
  avg_retrieval_ms: number | null;
  avg_llm_ms: number | null;
}
interface Log {
  id: number;
  ts: string;
  level: string;
  trace_id: string | null;
  route: string | null;
  event: string;
  data: Record<string, unknown>;
}

const fmt = (n: number | null) => (n == null ? "—" : `${n} ms`);

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [traceId, setTraceId] = useState("");
  const [level, setLevel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async (trace: string, lvl: string) => {
    const q = new URLSearchParams({ limit: "300" });
    if (trace) q.set("traceId", trace);
    if (lvl) q.set("level", lvl);
    const res = await apiFetch(`/api/admin/logs?${q}`);
    setLogs((await res.json()).logs);
  }, []);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch("/api/admin/conversations");
      const body = await res.json();
      setStats(body.stats);
      setConversations(body.conversations);
      await loadLogs(traceId, level);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [loadLogs, traceId, level]);

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function exportCsv() {
    const q = new URLSearchParams({ format: "csv", limit: "2000" });
    if (traceId) q.set("traceId", traceId);
    if (level) q.set("level", level);
    const blob = await (await apiFetch(`/api/admin/logs?${q}`)).blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "logs.csv";
    a.click();
  }

  const showTrace = (id: string) => {
    setTraceId(id);
    void loadLogs(id, level).catch((e) => setError(e.message));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Observability</h1>
        <button className="rounded border bg-white px-3 py-1 text-sm" onClick={() => void loadAll()}>Refresh</button>
      </div>
      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["Conversations", stats.conversations],
            ["Questions", stats.questions],
            ["Errors", stats.errors],
            ["Latency p50 / p95", `${fmt(stats.latency_ms.p50)} / ${fmt(stats.latency_ms.p95)}`],
            ["Avg latency", fmt(stats.latency_ms.avg)],
            ["Avg retrieval", fmt(stats.avg_retrieval_ms)],
            ["Avg LLM", fmt(stats.avg_llm_ms)],
            ["Answers", stats.answers],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-lg border bg-white p-3 shadow-sm">
              <div className="text-xs text-slate-500">{label}</div>
              <div className="text-lg font-semibold">{value}</div>
            </div>
          ))}
        </div>
      )}

      <section className="rounded-lg border bg-white shadow-sm">
        <h2 className="border-b px-4 py-2 font-semibold">Conversation transcripts</h2>
        <div className="max-h-[28rem] divide-y overflow-y-auto">
          {conversations.map((c) => (
            <details key={c.id} className="px-4 py-2">
              <summary className="cursor-pointer text-sm">
                <span className="font-mono text-xs text-slate-500">{c.id.slice(0, 8)}</span>{" "}
                {c.messages.find((m) => m.role === "user")?.content.slice(0, 90) ?? "(empty)"}{" "}
                <span className="text-xs text-slate-400">· {c.messages.length} msgs · {new Date(c.last_message_at).toLocaleString()}</span>
              </summary>
              <div className="mt-2 space-y-2">
                {c.messages.map((m) => (
                  <div key={m.id} className={`rounded p-2 text-sm ${m.role === "user" ? "bg-slate-50" : m.error ? "bg-red-50" : "bg-blue-50"}`}>
                    <div className="mb-1 flex flex-wrap gap-3 text-[11px] text-slate-500">
                      <b>{m.role}</b>
                      <span>{new Date(m.created_at).toLocaleTimeString()}</span>
                      {m.latency_ms != null && <span>total {m.latency_ms} ms</span>}
                      {m.retrieval_ms != null && <span>retrieval {m.retrieval_ms} ms</span>}
                      {m.llm_ms != null && <span>llm {m.llm_ms} ms</span>}
                      {m.completion_tokens != null && <span>tokens {m.prompt_tokens}/{m.completion_tokens}</span>}
                      <button className="font-mono underline" onClick={() => showTrace(m.trace_id)}>trace {m.trace_id.slice(0, 8)}</button>
                    </div>
                    {m.role === "assistant" ? (
                      <AnswerText content={m.content} sources={(m.sources ?? []) as { index: number; title: string | null; location: string }[]} />
                    ) : (
                      <div className="whitespace-pre-wrap">{m.content}</div>
                    )}
                    {m.error && <div className="mt-1 text-xs text-red-700">Error: {m.error}</div>}
                  </div>
                ))}
              </div>
            </details>
          ))}
          {!conversations.length && <p className="px-4 py-6 text-center text-sm text-slate-500">No conversations yet.</p>}
        </div>
      </section>

      <section className="rounded-lg border bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
          <h2 className="mr-auto font-semibold">Structured logs</h2>
          <input className="rounded border px-2 py-1 font-mono text-xs" placeholder="trace id" value={traceId} onChange={(e) => setTraceId(e.target.value)} />
          <select className="rounded border px-2 py-1 text-xs" value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">all levels</option>
            <option value="info">info</option>
            <option value="warn">warn</option>
            <option value="error">error</option>
          </select>
          <button className="rounded border px-2 py-1 text-xs" onClick={() => void loadLogs(traceId, level).catch((e) => setError(e.message))}>Filter</button>
          <button className="rounded border px-2 py-1 text-xs" onClick={() => void exportCsv().catch((e) => setError(e.message))}>Export CSV</button>
        </div>
        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead className="sticky top-0 bg-white text-slate-500">
              <tr><th className="px-3 py-1">time</th><th>level</th><th>event</th><th>route</th><th>trace</th><th>data</th></tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className={`border-t align-top ${l.level === "error" ? "bg-red-50" : l.level === "warn" ? "bg-amber-50" : ""}`}>
                  <td className="whitespace-nowrap px-3 py-1">{new Date(l.ts).toLocaleTimeString()}</td>
                  <td>{l.level}</td>
                  <td className="whitespace-nowrap">{l.event}</td>
                  <td className="whitespace-nowrap">{l.route}</td>
                  <td>{l.trace_id ? <button className="underline" onClick={() => showTrace(l.trace_id!)}>{l.trace_id.slice(0, 8)}</button> : "—"}</td>
                  <td className="max-w-md break-all py-1 pr-3">{JSON.stringify(l.data)}</td>
                </tr>
              ))}
              {!logs.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">No logs.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
