"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "./api";
import { readSse } from "./sse";

interface SourceRef {
  index: number;
  title: string | null;
  location: string;
  similarity: number;
  snippet: string;
}

interface Msg {
  role: "user" | "assistant";
  content: string;
  sources?: SourceRef[];
  traceId?: string;
  latencyMs?: number;
  error?: boolean;
}

export function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), [messages]);

  const patchLast = (patch: (m: Msg) => Msg) =>
    setMessages((prev) => [...prev.slice(0, -1), patch(prev[prev.length - 1])]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || busy) return;
    setInput("");
    setBusy(true);
    setMessages((prev) => [...prev, { role: "user", content: question }, { role: "assistant", content: "" }]);

    try {
      const res = await apiFetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: question, conversationId }),
      });
      for await (const { event, data } of readSse(res)) {
        const d = data as Record<string, unknown>;
        if (event === "meta") {
          setConversationId(d.conversationId as string);
          patchLast((m) => ({ ...m, sources: d.sources as SourceRef[], traceId: d.traceId as string }));
        } else if (event === "token") {
          patchLast((m) => ({ ...m, content: m.content + (d.content as string) }));
        } else if (event === "done") {
          patchLast((m) => ({ ...m, latencyMs: d.latencyMs as number }));
        } else if (event === "error") {
          patchLast((m) => ({ ...m, content: m.content || (d.message as string), error: true, traceId: d.traceId as string }));
        }
      }
    } catch (err) {
      patchLast((m) => ({ ...m, content: (err as Error).message, error: true }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col rounded-lg border bg-white shadow-sm">
      <div className="flex items-center justify-between border-b px-4 py-2 text-sm">
        <span className="font-medium">Ask about the ingested website / documents</span>
        <button
          className="text-slate-500 hover:text-slate-900"
          onClick={() => {
            setMessages([]);
            setConversationId(undefined);
          }}
        >
          New conversation
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {!messages.length && (
          <p className="mt-10 text-center text-sm text-slate-500">
            Ingest a website or document on the <a className="underline" href="/ingest">Ingest</a> page, then ask a question.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                m.role === "user" ? "bg-slate-900 text-white" : m.error ? "bg-red-50 text-red-800" : "bg-slate-100"
              }`}
            >
              {m.content || (busy && i === messages.length - 1 ? "Thinking…" : "")}
              {m.sources && m.sources.length > 0 && (
                <details className="mt-2 text-xs text-slate-600">
                  <summary className="cursor-pointer">Sources ({m.sources.length})</summary>
                  <ol className="mt-1 space-y-1">
                    {m.sources.map((s) => (
                      <li key={s.index}>
                        [{s.index}]{" "}
                        {s.location.startsWith("http") ? (
                          <a className="underline" href={s.location} target="_blank" rel="noreferrer">
                            {s.title || s.location}
                          </a>
                        ) : (
                          s.title || s.location
                        )}{" "}
                        <span className="text-slate-400">({s.similarity})</span>
                      </li>
                    ))}
                  </ol>
                </details>
              )}
              {(m.traceId || m.latencyMs) && (
                <div className="mt-1 text-[10px] text-slate-400">
                  {m.latencyMs ? `${m.latencyMs} ms · ` : ""}trace {m.traceId}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>

      <form onSubmit={send} className="flex gap-2 border-t p-3">
        <input
          className="flex-1 rounded border px-3 py-2 text-sm"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question…"
          maxLength={2000}
        />
        <button className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
