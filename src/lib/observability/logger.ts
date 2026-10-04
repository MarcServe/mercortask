import { db } from "@/lib/db/client";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  traceId?: string;
  route?: string;
}

/**
 * Structured JSON logger.
 * - Always writes one JSON line to stdout (picked up by Vercel / any log shipper).
 * - Also persists to `asmt_logs` (best effort, never throws) so logs are queryable from the admin dashboard.
 */
export class Logger {
  constructor(private readonly ctx: LogContext = {}) {}

  child(extra: LogContext): Logger {
    return new Logger({ ...this.ctx, ...extra });
  }

  debug(event: string, data: Record<string, unknown> = {}) {
    this.write("debug", event, data);
  }
  info(event: string, data: Record<string, unknown> = {}) {
    this.write("info", event, data);
  }
  warn(event: string, data: Record<string, unknown> = {}) {
    this.write("warn", event, data);
  }
  error(event: string, data: Record<string, unknown> = {}) {
    this.write("error", event, data);
  }

  private write(level: LogLevel, event: string, data: Record<string, unknown>) {
    const entry = {
      ts: new Date().toISOString(),
      level,
      event,
      trace_id: this.ctx.traceId ?? null,
      route: this.ctx.route ?? null,
      ...data,
    };
    const line = JSON.stringify(entry);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);

    if (level === "debug") return;
    void persist(level, event, this.ctx, data);
  }
}

async function persist(level: LogLevel, event: string, ctx: LogContext, data: Record<string, unknown>) {
  try {
    const { error } = await db()
      .from("asmt_logs")
      .insert({ level, event, trace_id: ctx.traceId ?? null, route: ctx.route ?? null, data });
    if (error) console.error(JSON.stringify({ level: "error", event: "log_persist_failed", message: error.message }));
  } catch (err) {
    console.error(JSON.stringify({ level: "error", event: "log_persist_failed", message: String(err) }));
  }
}

export const rootLogger = new Logger();

/** Measure an async step and log it (used for external API calls). */
export async function timed<T>(
  log: Logger,
  event: string,
  fn: () => Promise<T>,
  data: Record<string, unknown> = {},
): Promise<{ result: T; ms: number }> {
  const start = performance.now();
  try {
    const result = await fn();
    const ms = Math.round(performance.now() - start);
    log.info(event, { ...data, duration_ms: ms, ok: true });
    return { result, ms };
  } catch (err) {
    const ms = Math.round(performance.now() - start);
    log.error(event, { ...data, duration_ms: ms, ok: false, error: errorMessage(err) });
    throw err;
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
