import { isAIConfigured } from "./ai-client";
import { generateEmbedding } from "./embedding-service";
import { searchEmbeddings, getEmbeddingCacheSize } from "./embedding-cache";
import { logger } from "../utils/logger";

export { isAIConfigured };

export interface SmartSearchResult {
  orderedIds: number[];
  searchMode: "semantic" | "smart" | "basic";
}

/**
 * Perform semantic search using vector embeddings.
 * 1. Embed the query (1 API call, ~200ms)
 * 2. Cosine similarity against in-memory cache (~2ms)
 * 3. Return ranked results
 *
 * Falls back to basic LIKE search if:
 * - AI is not configured
 * - Embedding cache is empty
 * - Query embedding fails
 */
export async function smartSearch(
  query: string,
  filters: { archived?: boolean },
): Promise<SmartSearchResult> {
  const archived = filters.archived ?? false;

  if (!isAIConfigured()) {
    return { orderedIds: [], searchMode: "basic" };
  }

  if (getEmbeddingCacheSize() === 0) {
    return { orderedIds: [], searchMode: "basic" };
  }

  try {
    const queryEmbedding = await generateEmbedding(query);
    if (!queryEmbedding) {
      return { orderedIds: [], searchMode: "basic" };
    }

    const results = searchEmbeddings(queryEmbedding, {
      limit: 50,
      threshold: 0.3,
      archived,
    });

    if (results.length === 0) {
      return { orderedIds: [], searchMode: "semantic" };
    }

    return {
      orderedIds: results.map((r) => r.id),
      searchMode: "semantic",
    };
  } catch (error) {
    logger.error("Semantic search failed, falling back to basic", {
      query,
      error: error instanceof Error ? error.message : String(error),
    });
    return { orderedIds: [], searchMode: "basic" };
  }
}
