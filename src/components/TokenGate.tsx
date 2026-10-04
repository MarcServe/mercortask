"use client";

import { useEffect, useState } from "react";
import { getToken, setToken } from "./api";

/** Asks for the API bearer token once and stores it locally; all UI calls send it as Authorization header. */
export function TokenGate({ children }: { children: React.ReactNode }) {
  const [token, setTok] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setTok(getToken());
    const onUnauthorized = () => {
      setToken("");
      setTok("");
    };
    window.addEventListener("rag-unauthorized", onUnauthorized);
    return () => window.removeEventListener("rag-unauthorized", onUnauthorized);
  }, []);

  if (token === null) return null;
  if (!token) {
    return (
      <form
        className="mx-auto mt-16 max-w-md space-y-3 rounded-lg border bg-white p-6 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          setToken(draft.trim());
          setTok(draft.trim());
        }}
      >
        <h1 className="text-lg font-semibold">Enter API token</h1>
        <p className="text-sm text-slate-600">All endpoints are protected by a bearer token (API_AUTH_TOKEN).</p>
        <input
          type="password"
          className="w-full rounded border px-3 py-2"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="API token"
          autoFocus
        />
        <button className="w-full rounded bg-slate-900 py-2 text-white disabled:opacity-50" disabled={!draft.trim()}>
          Continue
        </button>
      </form>
    );
  }
  return <>{children}</>;
}
