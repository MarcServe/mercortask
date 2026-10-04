import { NextResponse } from "next/server";
import { sourcesRepo } from "@/lib/db/repo";
import { badRequest, notFound } from "@/lib/errors";
import { withApi } from "@/lib/observability/handler";

export const runtime = "nodejs";

const UUID = /^[0-9a-f-]{36}$/i;

export const DELETE = withApi("DELETE /api/sources/:id", async (_req, { log }, { params }) => {
  if (!UUID.test(params.id)) throw badRequest("Invalid source id");
  if (!(await sourcesRepo.remove(params.id))) throw notFound("Source not found");
  log.info("source.deleted", { source_id: params.id });
  return NextResponse.json({ deleted: params.id });
});
