import { getClient, isGeminiConfigured } from "./gemini-client";
import { bookmarks } from "@bookmark/db/schema/bookmarks";
import { db } from "@bookmark/db";
import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { logger } from "../utils/logger";

export { isGeminiConfigured };

// Simple in-memory cache for query expansions (5 min TTL)
const expansionCache = new Map<string, { terms: string[]; expiry: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Ask Gemini to expand a search query into related keywords.
 */
async function expandQuery(query: string): Promise<string[]> {
  const cached = expansionCache.get(query);
  if (cached && cached.expiry > Date.now()) {
    return cached.terms;
  }

  const client = getClient();
  if (!client) return [query];

  try {
    const model = client.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    const result = await model.generateContent([
      `Given the search query below, generate 5-10 related keywords or phrases that someone might use to find relevant bookmarks. Include synonyms, related concepts, and alternate phrasings. Return ONLY a JSON array of strings, no other text.`,
      `Query: "${query}"`,
    ]);

    const text = result.response.text().trim();
    const cleaned = text
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();

    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [query];

    const terms = [query, ...parsed.filter((t): t is string => typeof t === "string")];
    expansionCache.set(query, { terms, expiry: Date.now() + CACHE_TTL_MS });

    // Clean up expired entries periodically
    if (expansionCache.size > 100) {
      const now = Date.now();
      for (const [key, val] of expansionCache) {
        if (val.expiry < now) expansionCache.delete(key);
      }
    }

    return terms;
  } catch (error) {
    logger.error("Query expansion failed", {
      query,
      error: error instanceof Error ? error.message : String(error),
    });
    return [query];
  }
}

interface SearchCandidate {
  id: number;
  title: string | null;
  description: string | null;
  url: string;
  tags: string[] | null;
  summary: string | null;
}

/**
 * Ask Gemini to rerank candidates by semantic relevance to the query.
 */
async function rerankResults(
  query: string,
  candidates: SearchCandidate[],
): Promise<number[]> {
  if (candidates.length === 0) return [];
  if (candidates.length <= 3) return candidates.map((c) => c.id);

  const client = getClient();
  if (!client) return candidates.map((c) => c.id);

  try {
    const model = client.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    const candidateList = candidates
      .map(
        (c) =>
          `ID:${c.id} | Title: ${c.title ?? "N/A"} | URL: ${c.url} | Tags: ${(c.tags ?? []).join(", ") || "none"} | Desc: ${(c.description ?? "").slice(0, 200)} | Summary: ${(c.summary ?? "").slice(0, 200)}`,
      )
      .join("\n");

    const result = await model.generateContent([
      `Given the search query and bookmark candidates below, return the IDs ordered by relevance to the query (most relevant first). Return ONLY a JSON array of ID numbers, no other text. Include all IDs.`,
      `Query: "${query}"\n\nCandidates:\n${candidateList}`,
    ]);

    const text = result.response.text().trim();
    const cleaned = text
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();

    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return candidates.map((c) => c.id);

    const validIds = new Set(candidates.map((c) => c.id));
    const orderedIds = parsed
      .filter((id): id is number => typeof id === "number" && validIds.has(id));

    // Append any IDs that Gemini missed
    for (const c of candidates) {
      if (!orderedIds.includes(c.id)) {
        orderedIds.push(c.id);
      }
    }

    return orderedIds;
  } catch (error) {
    logger.error("Reranking failed", {
      query,
      error: error instanceof Error ? error.message : String(error),
    });
    return candidates.map((c) => c.id);
  }
}

export interface SmartSearchResult {
  orderedIds: number[];
  searchMode: "smart" | "basic";
}

/**
 * Perform smart search: expand query → broad LIKE search → rerank.
 * Falls back to basic LIKE search if Gemini is not available.
 */
export async function smartSearch(
  query: string,
  filters: { archived?: boolean },
): Promise<SmartSearchResult> {
  const archived = filters.archived ?? false;

  if (!isGeminiConfigured()) {
    return { orderedIds: [], searchMode: "basic" };
  }

  try {
    // Phase 1: Expand query
    const terms = await expandQuery(query);

    // Phase 2: Broad LIKE search with expanded terms (including tags)
    const likeConditions = terms.flatMap((term) => {
      const pattern = `%${term}%`;
      return [
        like(bookmarks.title, pattern),
        like(bookmarks.description, pattern),
        like(bookmarks.url, pattern),
        like(bookmarks.summary, pattern),
        sql`EXISTS (SELECT 1 FROM json_each(${bookmarks.tags}) AS je WHERE je.value LIKE ${pattern})`,
      ];
    });

    const candidates = await db
      .select({
        id: bookmarks.id,
        title: bookmarks.title,
        description: bookmarks.description,
        url: bookmarks.url,
        tags: bookmarks.tags,
        summary: bookmarks.summary,
      })
      .from(bookmarks)
      .where(
        and(
          eq(bookmarks.isArchived, archived),
          or(...likeConditions),
        ),
      )
      .orderBy(desc(bookmarks.createdAt))
      .limit(50);

    if (candidates.length === 0) {
      return { orderedIds: [], searchMode: "smart" };
    }

    // Phase 3: Rerank
    const orderedIds = await rerankResults(query, candidates);

    return { orderedIds, searchMode: "smart" };
  } catch (error) {
    logger.error("Smart search failed, falling back to basic", {
      query,
      error: error instanceof Error ? error.message : String(error),
    });
    return { orderedIds: [], searchMode: "basic" };
  }
}
