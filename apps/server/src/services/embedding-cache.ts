import { dbClient } from "@bookmark/db";
import { cosineSimilarity, deserializeEmbedding } from "./embedding-service";
import { logger } from "../utils/logger";

interface CacheEntry {
  embedding: Float32Array;
  isArchived: boolean;
}

const cache = new Map<number, CacheEntry>();

/**
 * Load all embeddings from the database into the in-memory cache.
 * Called once at server startup.
 */
export async function loadEmbeddingCache(): Promise<void> {
  try {
    const result = await dbClient.execute(
      "SELECT id, embedding, is_archived FROM bookmarks WHERE embedding IS NOT NULL",
    );

    let loaded = 0;
    for (const row of result.rows) {
      const id = Number(row.id);
      const blob = row.embedding;
      if (!blob) continue;

      try {
        const embedding = deserializeEmbedding(blob as Buffer | ArrayBuffer);
        cache.set(id, {
          embedding,
          isArchived: Boolean(row.is_archived),
        });
        loaded++;
      } catch {
        // Skip corrupt entries
      }
    }

    logger.info("Embedding cache loaded", { entries: loaded });
  } catch (error) {
    logger.error("Failed to load embedding cache", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Search the cache for the most similar embeddings to the query vector.
 */
export function searchEmbeddings(
  queryEmbedding: Float32Array,
  opts: { limit?: number; threshold?: number; archived?: boolean } = {},
): { id: number; score: number }[] {
  const limit = opts.limit ?? 50;
  const threshold = opts.threshold ?? 0.3;
  const archived = opts.archived ?? false;

  const results: { id: number; score: number }[] = [];

  for (const [id, entry] of cache) {
    if (entry.isArchived !== archived) continue;

    const score = cosineSimilarity(queryEmbedding, entry.embedding);
    if (score >= threshold) {
      results.push({ id, score });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

/**
 * Add or update a cache entry.
 */
export function setEmbeddingCacheEntry(
  id: number,
  embedding: Float32Array,
  isArchived: boolean,
): void {
  cache.set(id, { embedding, isArchived });
}

/**
 * Remove a cache entry (e.g. on bookmark delete).
 */
export function removeEmbeddingCacheEntry(id: number): void {
  cache.delete(id);
}

/**
 * Update the archived status of a cache entry.
 */
export function updateEmbeddingCacheArchived(id: number, isArchived: boolean): void {
  const entry = cache.get(id);
  if (entry) {
    entry.isArchived = isArchived;
  }
}

/**
 * Get the current cache size (for diagnostics).
 */
export function getEmbeddingCacheSize(): number {
  return cache.size;
}
