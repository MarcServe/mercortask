import { NextResponse } from "next/server";
import { logsRepo, type LogRow } from "@/lib/db/repo";
import { withApi } from "@/lib/observability/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

function toCsv(rows: LogRow[]) {
  const header = ["ts", "level", "trace_id", "route", "event", "data"];
  const lines = rows.map((r) => [r.ts, r.level, r.trace_id, r.route, r.event, JSON.stringify(r.data)].map(csvCell).join(","));
  return [header.join(","), ...lines].join("\n");
}

/** Structured logs, filterable by traceId / level / event prefix; `format=csv` for export. */
export const GET = withApi("GET /api/admin/logs", async (req) => {
  const p = req.nextUrl.searchParams;
  const rows = await logsRepo.query({
    traceId: p.get("traceId") ?? undefined,
    level: p.get("level") ?? undefined,
    event: p.get("event") ?? undefined,
    limit: Math.min(Number(p.get("limit") ?? 200) || 200, 2000),
  });
  if (p.get("format") === "csv") {
    return new Response(toCsv(rows), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="logs-${new Date().toISOString().slice(0, 19)}.csv"`,
      },
    });
  }
  return NextResponse.json({ logs: rows });
});
