export interface Chunk {
  content: string;
  index: number;
  tokenCount: number;
  heading?: string;
}

export interface ChunkOptions {
  /** Target max chunk size in (approximate) tokens. */
  maxTokens?: number;
  /** Tokens of overlap carried from the previous chunk. */
  overlapTokens?: number;
}

/** Cheap token estimate (~4 chars per token for English). Good enough for chunk sizing. */
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);

/** Normalise whitespace while keeping paragraph breaks. */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const HEADING_RE = /^(#{1,6}\s+.+|[A-Z][^.!?\n]{2,80})$/;

/**
 * Semantic-ish chunker:
 *  1. splits on paragraphs (blank lines) so chunks respect natural boundaries,
 *  2. tracks the most recent heading-like line and prefixes it to each chunk for context,
 *  3. packs paragraphs up to `maxTokens`, splitting oversize paragraphs on sentences,
 *  4. carries a small sentence-level overlap between consecutive chunks.
 */
export function chunkText(raw: string, opts: ChunkOptions = {}): Chunk[] {
  const maxTokens = opts.maxTokens ?? 400;
  const overlapTokens = opts.overlapTokens ?? 60;
  const text = normalizeText(raw);
  if (!text) return [];

  const units: { text: string; heading?: string }[] = [];
  let heading: string | undefined;
  for (const para of text.split(/\n\n+/)) {
    const p = para.trim();
    if (!p) continue;
    if (!p.includes("\n") && HEADING_RE.test(p) && p.length < 90) {
      heading = p.replace(/^#+\s*/, "");
    }
    if (estimateTokens(p) <= maxTokens) {
      units.push({ text: p, heading });
    } else {
      for (const s of splitSentences(p, maxTokens)) units.push({ text: s, heading });
    }
  }

  const chunks: Chunk[] = [];
  let buf: string[] = [];
  let bufHeading: string | undefined;
  let hasNewContent = false; // false when buf only holds overlap carried from the previous chunk

  const flush = () => {
    const body = buf.join("\n\n");
    const content = bufHeading && !body.startsWith(bufHeading) ? `${bufHeading}\n\n${body}` : body;
    chunks.push({ content, index: chunks.length, tokenCount: estimateTokens(content), heading: bufHeading });
    const tail = overlapTail(body, overlapTokens);
    buf = tail ? [tail] : [];
    bufHeading = undefined;
    hasNewContent = false;
  };

  for (const u of units) {
    if (hasNewContent && estimateTokens(buf.join("\n\n")) + estimateTokens(u.text) > maxTokens) flush();
    bufHeading ??= u.heading;
    buf.push(u.text);
    hasNewContent = true;
  }
  if (hasNewContent) flush();
  return chunks;
}

function splitSentences(text: string, maxTokens: number): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [text];
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if (cur && estimateTokens(cur + s) > maxTokens) {
      out.push(cur.trim());
      cur = "";
    }
    // Hard-split pathological sentences with no punctuation.
    if (estimateTokens(s) > maxTokens) {
      const size = maxTokens * 4;
      for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size).trim());
      continue;
    }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function overlapTail(text: string, overlapTokens: number): string {
  if (overlapTokens <= 0) return "";
  const sentences = text.match(/[^.!?]+[.!?]+\s*/g) ?? [];
  let tail = "";
  for (let i = sentences.length - 1; i >= 0; i--) {
    if (estimateTokens(sentences[i] + tail) > overlapTokens) break;
    tail = sentences[i] + tail;
  }
  return tail.trim();
}
