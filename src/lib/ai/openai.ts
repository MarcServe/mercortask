import OpenAI from "openai";
import { config } from "@/lib/config";

let client: OpenAI | null = null;

export function openai(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: config().OPENAI_API_KEY, maxRetries: 3, timeout: 60_000 });
  }
  return client;
}
