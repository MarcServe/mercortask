import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { config } from "@/lib/config";
import { AppError, unauthorized } from "@/lib/errors";
import { errorMessage, Logger } from "./logger";

export interface RequestContext {
  traceId: string;
  log: Logger;
  startedAt: number;
}

type RouteParams = { params: Record<string, string> };
type Handler = (req: NextRequest, ctx: RequestContext, route: RouteParams) => Promise<Response>;

/**
 * Wraps every API route with: trace ID, bearer-token auth, structured request/response/error logging,
 * and consistent JSON error responses. The trace ID is returned in the `x-trace-id` header.
 */
export function withApi(routeName: string, handler: Handler, opts: { auth?: boolean } = {}) {
  const requireAuth = opts.auth ?? true;
  return async (req: NextRequest, route: RouteParams): Promise<Response> => {
    const traceId = req.headers.get("x-trace-id") || randomUUID();
    const log = new Logger({ traceId, route: routeName });
    const startedAt = performance.now();
    log.info("request.start", { method: req.method, path: req.nextUrl.pathname });

    let res: Response;
    try {
      if (requireAuth && !isAuthorized(req.headers.get("authorization"), config().API_AUTH_TOKEN)) {
        throw unauthorized();
      }
      res = await handler(req, { traceId, log, startedAt }, route);
    } catch (err) {
      const isApp = err instanceof AppError;
      const status = isApp ? err.status : 500;
      log[status >= 500 ? "error" : "warn"]("request.error", {
        status,
        error: errorMessage(err),
        stack: !isApp && err instanceof Error ? err.stack?.split("\n").slice(0, 5).join("\n") : undefined,
      });
      res = NextResponse.json(
        {
          error: isApp ? err.code : "internal_error",
          message: isApp ? err.message : "Unexpected server error",
          traceId,
        },
        { status },
      );
    }

    res.headers.set("x-trace-id", traceId);
    log.info("request.end", {
      method: req.method,
      status: res.status,
      duration_ms: Math.round(performance.now() - startedAt),
    });
    return res;
  };
}
