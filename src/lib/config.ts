import { z } from "zod";

const schema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  API_AUTH_TOKEN: z.string().min(16, "API_AUTH_TOKEN must be at least 16 characters"),
  OPENAI_CHAT_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  RAG_MATCH_COUNT: z.coerce.number().int().min(1).max(20).default(6),
  RAG_MIN_SIMILARITY: z.coerce.number().min(0).max(1).default(0.2),
  CRAWL_MAX_PAGES: z.coerce.number().int().min(1).max(100).default(20),
  UPLOAD_MAX_MB: z.coerce.number().min(1).max(50).default(10),
});

const DEFAULT_SUPABASE_URL = "https://oujqkygfmyapmrgxmhvt.supabase.co";

export type AppConfig = z.infer<typeof schema>;

let cached: AppConfig | null = null;

/** Validated server configuration. Throws a descriptive error if env is misconfigured. */
export function config(): AppConfig {
  if (cached) return cached;
  const env = process.env;
  const parsed = schema.safeParse({
    ...env,
    // Accept the names already used by TalkWeb's Vite/Next apps; the project URL is public, so default to it.
    SUPABASE_URL:
      env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY,
  });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}
