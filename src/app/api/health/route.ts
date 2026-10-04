import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { withApi } from "@/lib/observability/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Unauthenticated liveness/readiness probe (checks DB connectivity, exposes no data). */
export const GET = withApi(
  "GET /api/health",
  async () => {
    const { error } = await db().from("asmt_sources").select("id", { head: true, count: "exact" });
    return NextResponse.json({ status: error ? "degraded" : "ok", db: error ? "unreachable" : "ok" }, { status: error ? 503 : 200 });
  },
  { auth: false },
);
