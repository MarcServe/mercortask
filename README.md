# RAG Information Assistant

A website and document Q&A assistant that can be embedded on any business site. It **ingests** a website or uploaded documents (PDF incl. scanned, DOCX, XLSX, PPTX, CSV, TXT, MD and more), **answers questions** with retrieval-augmented generation (RAG) and streamed, cited answers, and records **structured logs** for every interaction. An admin dashboard shows the logs and response latencies.

Built with Next.js 14 (App Router, TypeScript), Supabase Postgres + **pgvector**, and OpenAI (`text-embedding-3-small` for embeddings, `gpt-4o-mini` for answers).

---

## Features → requirements

| Requirement | Where |
|---|---|
| Crawl a website URL (same origin, breadth-first, page limit) | `src/lib/ingest/crawl.ts`, `POST /api/ingest/url` |
| Upload PDF / DOCX (plus XLSX, PPTX, CSV, JSON, RTF, TXT, MD) | `POST /api/ingest/file` → `src/lib/ingest/parse.ts` → existing Supabase edge function **`parse-document`** (shared with TalkWeb; OpenAI-based PDF extraction incl. scanned docs) |
| Split text into chunks along paragraph and heading boundaries, with overlap | `src/lib/ingest/chunk.ts` |
| Embeddings in a vector DB (pgvector, HNSW cosine index) | `supabase/setup.sql`, `src/lib/ai/embeddings.ts` |
| Semantic search on each message → RAG context | `src/lib/rag/retrieve.ts`, SQL `asmt_match_chunks` |
| Cloud LLM answers, streamed in real time, with citations | `src/lib/rag/answer.ts`, `POST /api/chat` (SSE), `src/components/Chat.tsx` |
| Conversation memory (follow-up questions) | `asmt_conversations` / `asmt_messages`, `buildRetrievalQuery` |
| Trace ID and timestamps on every interaction | `src/lib/observability/handler.ts` (`x-trace-id` header), `asmt_messages.trace_id` |
| Structured logs (requests, errors, external API calls, failures) | `src/lib/observability/logger.ts` → stdout JSON **and** `asmt_logs` |
| Admin dashboard and endpoints for transcripts, questions, latencies; CSV export | `/admin`, `GET /api/admin/conversations`, `GET /api/admin/logs?format=csv` |
| Bearer-token auth on every endpoint | `src/lib/auth.ts` (constant-time compare), enforced by the `withApi` wrapper |
| Secrets read from environment variables and validated at startup | `src/lib/config.ts` (zod) |

---

## Architecture

```
 Browser (Chat / Ingest / Admin UI)              any website (embed /)
        │  Authorization: Bearer <API_AUTH_TOKEN>
        ▼
 ┌──────────────────────── Next.js API routes (src/app/api) ─────────────────────────┐
 │ withApi(): trace id · auth · request/response/error logging · JSON errors          │
 │                                                                                    │
 │  /ingest/url ─► crawl.ts ─┐                    /chat ─► rag/answer.ts (app logic)  │
 │  /ingest/file ─► parse.ts ─┴► ingest/pipeline.ts      │  history → retrieve.ts     │
 │       └─► Supabase edge fn `parse-document` (reused)   │                            │
 │                               chunk → embed → store   │  prompt.ts → LLM stream    │
 │  /sources, /admin/*  ─► db/repo.ts (data access)      │  persist msg + latencies   │
 └──────────────┬──────────────────────────────┬─────────┴────────────────────────────┘
                │                              │
     Supabase Postgres + pgvector         OpenAI API
     asmt_sources · asmt_chunks           embeddings / chat completions
     asmt_conversations · asmt_messages
     asmt_logs · fn asmt_match_chunks
```

**Layers (separation of concerns)**
- `src/lib/ai`: model provider clients (embeddings, chat). Retries and timeouts are set on the OpenAI client.
- `src/lib/ingest`: crawl, chunk, and the ingestion pipeline. Document text extraction is **not** re-implemented here: `parse.ts` calls the existing `parse-document` Supabase edge function already used by TalkWeb.
- `src/lib/rag`: retrieval, prompt construction, and the per-turn answer flow. This layer doesn't depend on HTTP and yields events.
- `src/lib/db`: Supabase client and repositories. All table knowledge lives here.
- `src/lib/observability`: logger, timing helper, and the API wrapper.
- `src/app/api`: thin HTTP adapters (validation and transport only).
- `src/components`, `src/app/*/page.tsx`: frontend.

**Reused infrastructure.** This app runs on the existing TalkWeb Supabase project. It reuses the pgvector extension, the same embedding model and dimensions (`text-embedding-3-small`, 1536), and the deployed `parse-document` edge function for document extraction. Its own data lives only in temporary `asmt_*` tables.

**Observability model.** Each request gets a trace ID. It comes from an incoming `x-trace-id` header if one is sent, otherwise a new UUID is generated. Every log line and every stored message carries it, and it is returned in the `x-trace-id` response header and shown under each chat answer. In the dashboard you can click a trace to see every event in that request: `request.start`, `crawl.page`, `edge.parse_document`, `openai.embeddings` (duration, batch size), `rag.retrieve` (matches, top similarity), `openai.chat` (duration, time to first token, token counts), `chat.answer` (total/retrieval/LLM latency), `request.end`, and any `*.error`/`*.failed` events.

---

## Setup

### 1. Database (Supabase)
This project uses an existing Supabase project. All objects it creates are prefixed **`asmt_`** and are temporary.

1. Open the Supabase dashboard → SQL Editor and run [`supabase/setup.sql`](supabase/setup.sql). It is idempotent and enables `vector` if it isn't already.
2. Row Level Security (RLS) is enabled on every `asmt_*` table and no policies are defined, so only the server-side **service role** key can read or write them.

To **remove everything** afterwards, run [`supabase/teardown.sql`](supabase/teardown.sql). It drops only the `asmt_*` tables and function, and finishes with a check query that should return 0 rows.

### 2. Environment
```bash
cp .env.example .env.local
# Fill in: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
# API_AUTH_TOKEN: openssl rand -hex 24
```

| Variable | Required | Default | Notes |
|---|---|---|---|
| `SUPABASE_URL` | yes | | |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | | server-only, never sent to the browser |
| `OPENAI_API_KEY` | yes | | |
| `API_AUTH_TOKEN` | yes | | ≥16 chars; bearer token for all endpoints |
| `OPENAI_CHAT_MODEL` | no | `gpt-4o-mini` | |
| `OPENAI_EMBEDDING_MODEL` | no | `text-embedding-3-small` | must produce 1536 dims |
| `RAG_MATCH_COUNT` | no | `6` | chunks retrieved per question |
| `RAG_MIN_SIMILARITY` | no | `0.2` | cosine similarity cut-off |
| `CRAWL_MAX_PAGES` | no | `20` | upper bound per crawl |
| `UPLOAD_MAX_MB` | no | `10` | |

### 3. Install and run
```bash
npm install
npm run dev            # http://localhost:3000  (enter API_AUTH_TOKEN when prompted)
```
Production: `npm run build && npm start`. On Vercel, import the repo and add the same environment variables.

### 4. Seed demo data
```bash
APP_URL=http://localhost:3000 API_AUTH_TOKEN=... npm run seed                     # sample PDF
APP_URL=http://localhost:3000 API_AUTH_TOKEN=... npm run seed -- https://example.com  # + a public site
```
`samples/acme-handbook.pdf` (same text as `samples/acme-handbook.md`) is a small fictional company handbook.

### 5. Tests and checks
```bash
npm test          # vitest: chunker, auth, URL guard, HTML extraction, prompt building
npm run lint
npm run typecheck
```

---

## Demo flow

1. **Ingest:** on `/ingest`, upload `samples/acme-handbook.pdf` and/or crawl a public site (e.g. `https://docs.python.org/3/tutorial/` with max pages 10). The source list shows status and chunk count.
2. **Ask:** on `/`, try the questions below. Answers stream in, cite passages as `[n]`, and include a source list, latency and trace ID.
   - Simple: *"Who founded Acme and when?"* · *"How long does standard shipping take?"*
   - Complex: *"Compare the three rockets on altitude, price and warranty, and recommend one for a school with a $300 budget per rocket."* · *"If I launched my Mesa X and it broke, can I return it?"* (combines the returns policy with the warranty exclusions)
   - Follow-up: *"And what about the Canyon Pro?"* (resolved using the conversation history)
   - Out of scope: *"What is Acme's stock price?"*. The assistant says it doesn't have that information instead of guessing.
3. **Observe:** on `/admin`, see the stats (p50/p95 latency, average retrieval and LLM time, errors) and the transcripts. Click a trace to see its log events, and use **Export CSV**.

## API reference (curl)

```bash
export T=<API_AUTH_TOKEN>; export U=http://localhost:3000

# Ingest a website
curl -X POST $U/api/ingest/url -H "Authorization: Bearer $T" -H 'content-type: application/json' \
  -d '{"url":"https://example.com","maxPages":5}'

# Upload a document
curl -X POST $U/api/ingest/file -H "Authorization: Bearer $T" -F file=@samples/acme-handbook.pdf

# List / delete sources
curl $U/api/sources -H "Authorization: Bearer $T"
curl -X DELETE $U/api/sources/<id> -H "Authorization: Bearer $T"

# Chat (Server-Sent Events: meta → token* → done | error)
curl -N -X POST $U/api/chat -H "Authorization: Bearer $T" -H 'content-type: application/json' \
  -d '{"message":"What does the Mesa X cost?"}'
# pass "conversationId" from the meta event to continue a conversation

# Observability
curl "$U/api/admin/conversations?limit=20" -H "Authorization: Bearer $T"
curl "$U/api/admin/logs?traceId=<id>" -H "Authorization: Bearer $T"
curl "$U/api/admin/logs?level=error&format=csv" -H "Authorization: Bearer $T" -o logs.csv

# Health (no auth)
curl $U/api/health
```

Errors are always JSON in the form `{ "error": code, "message", "traceId" }`, with status 400, 401, 404, 500 or 502.

---

## Design decisions and trade-offs

- **Single Next.js app** keeps the demo to one repo and one deploy. The RAG and ingestion logic in `src/lib` has no HTTP dependencies, so it could move to a worker or separate service without rewriting.
- **pgvector in Supabase** keeps vectors, metadata, transcripts and logs in one transactional store. HNSW gives fast approximate nearest-neighbour search. Deleting a source cascades to its chunks.
- **Chunking** respects paragraphs, prefixes each chunk with its section heading for context, splits oversized paragraphs on sentence boundaries, and carries a sentence-level overlap between chunks.
- **Grounding:** a low temperature, numbered context passages, required citations, and an explicit instruction to say "I don't have that information". Short follow-up questions are combined with the previous question before retrieval.
- **Security:**
  - every endpoint except `/api/health` requires a bearer token, compared in constant time
  - service-role key stays server-side
  - RLS locks the tables to the service role
  - input validated with zod
  - upload size and type limits
  - crawler limited to the same origin, with a page cap and a guard that blocks private and localhost addresses (SSRF)
- **Reliability:** OpenAI client retries (3) with timeouts, batched embeddings, per-page crawl timeouts, and ingestion status tracking (`processing → ready | failed` with the error stored). Failed chat turns are persisted with their error, and logging never takes a request down.
- **Not done, and what I'd add next:**
  - async ingestion via a queue (it is synchronous today, capped by `maxDuration`)
  - JavaScript-rendered pages (headless browser)
  - hybrid BM25 + vector search with re-ranking
  - per-tenant API keys and rate limiting
  - an OpenTelemetry exporter
  - an embeddable `<script>` widget
  - optional voice: browser Web Speech API for speech-to-text and `speechSynthesis` for text-to-speech
