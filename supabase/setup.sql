-- =====================================================================
-- RAG Assistant (assessment) — temporary schema objects
-- Every object is prefixed `asmt_` so it can be removed with teardown.sql.
-- Safe to re-run (idempotent). Does NOT modify any existing table.
-- =====================================================================
set search_path = public, extensions;

create extension if not exists vector;

-- Ingested sources (a crawled website or an uploaded document)
create table if not exists public.asmt_sources (
  id           uuid primary key default gen_random_uuid(),
  type         text not null check (type in ('url', 'file')),
  uri          text not null,
  title        text,
  status       text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'failed')),
  chunk_count  integer not null default 0,
  error        text,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Chunks + embeddings (text-embedding-3-small => 1536 dims)
create table if not exists public.asmt_chunks (
  id           uuid primary key default gen_random_uuid(),
  source_id    uuid not null references public.asmt_sources(id) on delete cascade,
  chunk_index  integer not null,
  content      text not null,
  token_count  integer not null default 0,
  metadata     jsonb not null default '{}'::jsonb,
  embedding    vector(1536) not null,
  created_at   timestamptz not null default now()
);
create index if not exists asmt_chunks_source_idx on public.asmt_chunks(source_id);
create index if not exists asmt_chunks_embedding_idx
  on public.asmt_chunks using hnsw (embedding vector_cosine_ops);

-- Conversations and messages (chat transcripts + latency metrics)
create table if not exists public.asmt_conversations (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  last_message_at  timestamptz not null default now()
);

create table if not exists public.asmt_messages (
  id                 uuid primary key default gen_random_uuid(),
  conversation_id    uuid not null references public.asmt_conversations(id) on delete cascade,
  role               text not null check (role in ('user', 'assistant')),
  content            text not null,
  trace_id           text not null,
  latency_ms         integer,
  retrieval_ms       integer,
  llm_ms             integer,
  prompt_tokens      integer,
  completion_tokens  integer,
  sources            jsonb not null default '[]'::jsonb,
  error              text,
  created_at         timestamptz not null default now()
);
create index if not exists asmt_messages_conversation_idx on public.asmt_messages(conversation_id, created_at);
create index if not exists asmt_messages_trace_idx on public.asmt_messages(trace_id);

-- Structured application logs (requests, errors, external API calls)
create table if not exists public.asmt_logs (
  id        bigint generated always as identity primary key,
  ts        timestamptz not null default now(),
  level     text not null,
  trace_id  text,
  route     text,
  event     text not null,
  data      jsonb not null default '{}'::jsonb
);
create index if not exists asmt_logs_ts_idx on public.asmt_logs(ts desc);
create index if not exists asmt_logs_trace_idx on public.asmt_logs(trace_id);

-- Semantic search
create or replace function public.asmt_match_chunks(
  query_embedding vector(1536),
  match_count     integer default 6,
  min_similarity  float default 0.2
)
returns table (
  id          uuid,
  source_id   uuid,
  content     text,
  metadata    jsonb,
  similarity  float,
  source_uri  text,
  source_title text
)
language sql stable
set search_path = public, extensions
as $$
  select c.id, c.source_id, c.content, c.metadata,
         1 - (c.embedding <=> query_embedding) as similarity,
         s.uri, s.title
  from public.asmt_chunks c
  join public.asmt_sources s on s.id = c.source_id
  where s.status = 'ready'
    and 1 - (c.embedding <=> query_embedding) >= min_similarity
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- Lock down: RLS on, no policies => only the service role (server) can access.
alter table public.asmt_sources       enable row level security;
alter table public.asmt_chunks        enable row level security;
alter table public.asmt_conversations enable row level security;
alter table public.asmt_messages      enable row level security;
alter table public.asmt_logs          enable row level security;

revoke all on function public.asmt_match_chunks(vector, integer, float) from public, anon, authenticated;
grant execute on function public.asmt_match_chunks(vector, integer, float) to service_role;
