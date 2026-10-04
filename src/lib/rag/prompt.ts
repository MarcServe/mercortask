export interface ContextChunk {
  content: string;
  title: string | null;
  location: string;
  similarity: number;
}

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export const SYSTEM_PROMPT = `You are a helpful assistant embedded on a business website.
Answer the user's question using ONLY the numbered context passages provided.
Rules:
- Cite the passages you used with bracketed numbers like [1] or [2][3].
- If the context does not contain the answer, say you don't have that information in the provided content and suggest what the user could ask instead. Never invent facts.
- For complex questions, synthesise across passages and structure the answer (short paragraphs or bullet points).
- Be concise and friendly.`;

/** Formats retrieved chunks as numbered context the model can cite. */
export function formatContext(chunks: ContextChunk[]): string {
  if (!chunks.length) return "No relevant context was found.";
  return chunks
    .map((c, i) => `[${i + 1}] (source: ${c.title ? `${c.title} — ` : ""}${c.location})\n${c.content}`)
    .join("\n\n---\n\n");
}

/** Builds the chat messages: system rules, recent history, then the question with retrieved context. */
export function buildMessages(question: string, chunks: ContextChunk[], history: HistoryMessage[] = []) {
  return [
    { role: "system" as const, content: SYSTEM_PROMPT },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    {
      role: "user" as const,
      content: `Context:\n${formatContext(chunks)}\n\nQuestion: ${question}`,
    },
  ];
}

/** Retrieval query: include the previous user turn so follow-ups like "what about pricing?" still retrieve well. */
export function buildRetrievalQuery(question: string, history: HistoryMessage[]): string {
  const lastUser = [...history].reverse().find((m) => m.role === "user");
  return lastUser && question.length < 80 ? `${lastUser.content}\n${question}` : question;
}
