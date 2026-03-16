import OpenAI from "openai";
import { env } from "@bookmark/env/server";

const DEFAULT_CHAT_MODEL = "google/gemini-2.5-flash-lite";
const DEFAULT_EMBEDDING_MODEL = "google/gemini-embedding-001";

let client: OpenAI | null = null;

export function getAIClient(): OpenAI | null {
  if (!env.OPENROUTER_API_KEY) return null;
  if (!client) {
    client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: env.OPENROUTER_API_KEY,
    });
  }
  return client;
}

export function isAIConfigured(): boolean {
  return !!env.OPENROUTER_API_KEY;
}

export function getChatModel(): string {
  return env.OPENROUTER_CHAT_MODEL ?? DEFAULT_CHAT_MODEL;
}

export function getEmbeddingModel(): string {
  return env.OPENROUTER_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL;
}
