"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "./api";

interface Source {
  id: string;
  type: "url" | "file";
  uri: string;
  status: string;
  chunk_count: number;
}

/** Compact view of what the assistant currently knows, shown above the chat. */
export function KnowledgeSources() {
  const [sources, setSources] = useState<Source[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/sources");
      setSources((await res.json()).sources);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const ready = sources?.filter((s) => s.status === "ready") ?? [];
  const chunks = ready.reduce((n, s) => n + s.chunk_count, 0);

  return (
    <div className="mb-3 rounded-lg border bg-white px-4 py-3 text-sm shadow-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium">
          Knowledge base{" "}
          {sources && (
            <span className="font-normal text-slate-500">
              · {ready.length} source{ready.length === 1 ? "" : "s"} · {chunks} chunks indexed
            </span>
          )}
        </span>
        <span className="flex gap-3 text-xs">
          <button className="text-slate-500 hover:text-slate-900" onClick={() => void load()}>Refresh</button>
          <Link className="text-slate-500 hover:text-slate-900" href="/ingest">Manage →</Link>
        </span>
      </div>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
      {sources && sources.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {sources.map((s) => (
            <li
              key={s.id}
              title={`${s.uri} — ${s.status}`}
              className={`max-w-xs truncate rounded-full border px-2 py-0.5 text-xs ${
                s.status === "ready" ? "border-green-200 bg-green-50 text-green-800" : s.status === "failed" ? "border-red-200 bg-red-50 text-red-700" : "bg-slate-50"
              }`}
            >
              {s.type === "url" ? "🌐" : "📄"} {s.uri.replace(/^https?:\/\//, "")} · {s.status === "ready" ? `${s.chunk_count} chunks` : s.status}
            </li>
          ))}
        </ul>
      )}
      {sources && sources.length === 0 && <p className="mt-1 text-xs text-slate-500">No sources yet — ingest a website or document first.</p>}
    </div>
  );
}
