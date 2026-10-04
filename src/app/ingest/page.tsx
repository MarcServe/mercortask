"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/components/api";

interface Source {
  id: string;
  type: "url" | "file";
  uri: string;
  title: string | null;
  status: string;
  chunk_count: number;
  error: string | null;
  created_at: string;
}

export default function IngestPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [url, setUrl] = useState("");
  const [maxPages, setMaxPages] = useState(10);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/sources");
      setSources((await res.json()).sources);
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(label: string, fn: () => Promise<Response>) {
    setBusy(label);
    setMessage(null);
    try {
      const { source } = await (await fn()).json();
      setMessage({ ok: true, text: `Ingested "${source.title ?? source.uri}" — ${source.chunk_count} chunks indexed.` });
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(null);
      void load();
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <form
          className="space-y-3 rounded-lg border bg-white p-4 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            void run("url", () =>
              apiFetch("/api/ingest/url", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ url, maxPages }),
              }),
            );
          }}
        >
          <h2 className="font-semibold">Crawl a website</h2>
          <input className="w-full rounded border px-3 py-2 text-sm" placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Max pages
            <input type="number" min={1} max={100} className="w-20 rounded border px-2 py-1" value={maxPages} onChange={(e) => setMaxPages(Number(e.target.value))} />
          </label>
          <button className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50" disabled={!!busy || !url}>
            {busy === "url" ? "Crawling & indexing…" : "Ingest URL"}
          </button>
        </form>

        <form
          className="space-y-3 rounded-lg border bg-white p-4 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            if (!file) return;
            const fd = new FormData();
            fd.append("file", file);
            void run("file", () => apiFetch("/api/ingest/file", { method: "POST", body: fd }));
          }}
        >
          <h2 className="font-semibold">Upload a document</h2>
          <input
            type="file"
            accept=".pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.txt,.md,.json,.csv,.rtf"
            className="text-sm"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <p className="text-xs text-slate-500">PDF (incl. scanned), DOCX, XLSX, PPTX, CSV, JSON, RTF, TXT, MD — parsed by the shared parse-document service</p>
          <button className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50" disabled={!!busy || !file}>
            {busy === "file" ? "Parsing & indexing…" : "Upload & ingest"}
          </button>
        </form>
      </div>

      {message && (
        <p className={`rounded px-3 py-2 text-sm ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>{message.text}</p>
      )}

      <div className="rounded-lg border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <h2 className="font-semibold">Knowledge sources</h2>
          <button className="text-sm text-slate-500 hover:text-slate-900" onClick={() => void load()}>Refresh</button>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="text-slate-500">
            <tr><th className="px-4 py-2">Source</th><th>Type</th><th>Status</th><th>Chunks</th><th>Added</th><th /></tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="max-w-xs truncate px-4 py-2" title={s.uri}>{s.uri}</td>
                <td>{s.type}</td>
                <td title={s.error ?? ""} className={s.status === "failed" ? "text-red-700" : s.status === "ready" ? "text-green-700" : ""}>{s.status}</td>
                <td>{s.chunk_count}</td>
                <td>{new Date(s.created_at).toLocaleString()}</td>
                <td className="pr-4 text-right">
                  <button
                    className="text-xs text-red-600 hover:underline"
                    onClick={async () => {
                      await apiFetch(`/api/sources/${s.id}`, { method: "DELETE" }).catch((e) => setMessage({ ok: false, text: e.message }));
                      void load();
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {!sources.length && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">No sources yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
