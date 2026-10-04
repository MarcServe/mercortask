import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { badRequest } from "@/lib/errors";
import { parseFile, SUPPORTED_EXTENSIONS } from "@/lib/ingest/parse";
import { ingestDocuments } from "@/lib/ingest/pipeline";
import { withApi } from "@/lib/observability/handler";

export const runtime = "nodejs";
export const maxDuration = 300;

export const POST = withApi("POST /api/ingest/file", async (req, { log }) => {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") throw badRequest('Send multipart/form-data with a "file" field');

  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!(SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)) {
    throw badRequest(`Unsupported file type. Supported: ${SUPPORTED_EXTENSIONS.join(", ")}`);
  }
  const maxBytes = config().UPLOAD_MAX_MB * 1024 * 1024;
  if (file.size > maxBytes) throw badRequest(`File too large (max ${config().UPLOAD_MAX_MB} MB)`);

  const buffer = Buffer.from(await file.arrayBuffer());
  log.info("ingest.file_received", { filename: file.name, bytes: file.size });

  const source = await ingestDocuments(
    { type: "file", uri: file.name, title: file.name },
    async () => {
      const doc = await parseFile(file.name, buffer, log);
      return [{ location: file.name, title: doc.title, text: doc.text }];
    },
    log,
  );
  return NextResponse.json({ source }, { status: 201 });
});
