import { getAIClient, getEmbeddingModel } from "./ai-client";
import { logger } from "../utils/logger";

/**
 * Generate an embedding vector for the given text via OpenRouter.
 * Returns a Float32Array, or null on failure.
 */
export async function generateEmbedding(text: string): Promise<Float32Array | null> {
  const client = getAIClient();
  if (!client) return null;

  try {
    const result = await client.embeddings.create({
      model: getEmbeddingModel(),
      input: text,
    });

    const values = result.data[0]?.embedding;
    if (!values || values.length === 0) {
      logger.warn("Embedding returned empty values");
      return null;
    }
    return new Float32Array(values);
  } catch (error) {
    logger.error("Embedding generation failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Build the text to embed for a bookmark.
 * Combines title, tags, summary, and description for maximum semantic coverage.
 */
export function buildEmbeddingText(bookmark: {
  title: string | null;
  url: string;
  tags: string[] | null;
  summary: string | null;
  description: string | null;
}): string {
  const parts: string[] = [];

  if (bookmark.title) {
    parts.push(bookmark.title);
  } else {
    try {
      parts.push(new URL(bookmark.url).hostname);
    } catch {
      parts.push(bookmark.url);
    }
  }

  const tags = Array.isArray(bookmark.tags) ? bookmark.tags : [];
  if (tags.length > 0) {
    parts.push(`Tags: ${tags.join(", ")}`);
  }

  if (bookmark.summary) {
    parts.push(bookmark.summary);
  }

  if (bookmark.description) {
    parts.push(bookmark.description.slice(0, 500));
  }

  return parts.join(" | ");
}

/**
 * Compute cosine similarity between two vectors.
 * Returns a value between -1 and 1 (1 = identical direction).
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

/**
 * Serialize a Float32Array embedding to a Buffer for SQLite BLOB storage.
 */
export function serializeEmbedding(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

/**
 * Deserialize a BLOB from SQLite back into a Float32Array.
 */
export function deserializeEmbedding(blob: Buffer | ArrayBuffer): Float32Array {
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}
