import { NextResponse } from "next/server";
import { sourcesRepo } from "@/lib/db/repo";
import { withApi } from "@/lib/observability/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApi("GET /api/sources", async () => {
  return NextResponse.json({ sources: await sourcesRepo.list() });
});
