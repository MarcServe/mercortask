import { config } from "@/lib/config";
import { upstream } from "@/lib/errors";
import { type Logger, timed } from "@/lib/observability/logger";
import { openai } from "./openai";

const BATCH_SIZE = 96;

/** Embed many texts in batches. Order of the result matches the input. */
export async function embedTexts(texts: string[], log: Logger): Promise<number[][]> {
  const model = config().OPENAI_EMBEDDING_MODEL;
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    try {
      const { result } = await timed(log, "openai.embeddings", () => openai().embeddings.create({ model, input: batch }), {
        model,
        batch_size: batch.length,
      });
      out.push(...result.data.sort((a, b) => a.index - b.index).map((d) => d.embedding));
    } catch {
      throw upstream("Embedding provider request failed");
    }
  }
  return out;
}

export async function embedQuery(text: string, log: Logger): Promise<number[]> {
  const [vec] = await embedTexts([text], log);
  return vec;
}
