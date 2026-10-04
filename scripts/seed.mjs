// Seeds demo data through the public API (exercises the real ingestion path).
// Usage: APP_URL=http://localhost:3000 API_AUTH_TOKEN=... npm run seed -- [https://some-public-site.com]
import { readFileSync } from "node:fs";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const TOKEN = process.env.API_AUTH_TOKEN;
if (!TOKEN) {
  console.error("Set API_AUTH_TOKEN (same value as the server).");
  process.exit(1);
}

async function call(path, init) {
  const res = await fetch(`${APP_URL}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${TOKEN}`, ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${JSON.stringify(body)}`);
  return body;
}

for (const name of ["acme-handbook.pdf"]) {
  const fd = new FormData();
  fd.append("file", new Blob([readFileSync(new URL(`../samples/${name}`, import.meta.url))]), name);
  const { source } = await call("/api/ingest/file", { method: "POST", body: fd });
  console.log(`✔ ${name}: ${source.chunk_count} chunks`);
}

const site = process.argv[2];
if (site) {
  const { source } = await call("/api/ingest/url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: site, maxPages: 10 }),
  });
  console.log(`✔ ${site}: ${source.chunk_count} chunks`);
}
console.log('Done. Try asking: "How much is the Mesa X and what warranty does it have?"');
