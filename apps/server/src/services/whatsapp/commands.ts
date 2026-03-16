import { bookmarks } from "@bookmark/db/schema/bookmarks";
import { db } from "@bookmark/db";
import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { smartSearch, isGeminiConfigured } from "../smart-search";
import { logger } from "../../utils/logger";
import type { WASocket } from "@whiskeysockets/baileys";

const MAX_SEARCH_RESULTS = 5;

/**
 * Check if a message is a question query prefixed with "?".
 * e.g. "?any nykaa links" → "any nykaa links"
 * Returns the query text after "?", or null if not a question.
 */
export function extractQuestionQuery(text: string): string | null {
  const t = text.trim();
  if (!t.startsWith("?")) return null;
  const query = t.slice(1).trim();
  return query.length > 0 ? query : null;
}

export async function handleSearchCommand(
  sock: WASocket,
  remoteJid: string,
  query: string,
  quotedMsg: any,
): Promise<void> {
  const trimmed = query.trim();
  if (!trimmed) return;

  // Tag search: starts with #
  if (trimmed.startsWith("#")) {
    const tag = trimmed.slice(1).toLowerCase();
    if (!tag) return;

    const conditions = [
      eq(bookmarks.isArchived, false),
      sql`EXISTS (
        SELECT 1 FROM json_each(${bookmarks.tags}) AS je
        WHERE je.value = ${tag}
      )`,
    ];

    try {
      const results = await db
        .select()
        .from(bookmarks)
        .where(and(...conditions))
        .orderBy(desc(bookmarks.createdAt))
        .limit(MAX_SEARCH_RESULTS);

      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(bookmarks)
        .where(and(...conditions));
      const count = countResult[0]?.count ?? 0;

      await sendSearchResults(sock, remoteJid, trimmed, results, count, quotedMsg);
    } catch (error) {
      logger.error("Search command failed", { query: trimmed, error });
      await sock.sendMessage(remoteJid, {
        text: "❌ Search failed, please try again",
      }, { quoted: quotedMsg });
    }
    return;
  }

  // Special keyword: "recent"
  if (trimmed === "recent") {
    try {
      const conditions = [eq(bookmarks.isArchived, false)];
      const results = await db
        .select()
        .from(bookmarks)
        .where(and(...conditions))
        .orderBy(desc(bookmarks.createdAt))
        .limit(MAX_SEARCH_RESULTS);

      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(bookmarks)
        .where(and(...conditions));
      const count = countResult[0]?.count ?? 0;

      await sendSearchResults(sock, remoteJid, trimmed, results, count, quotedMsg);
    } catch (error) {
      logger.error("Search command failed", { query: trimmed, error });
      await sock.sendMessage(remoteJid, {
        text: "❌ Search failed, please try again",
      }, { quoted: quotedMsg });
    }
    return;
  }

  // General text search — use smart search when available
  try {
    let results: any[] = [];
    let count = 0;
    let searchMode: "smart" | "basic" = "basic";

    if (isGeminiConfigured()) {
      try {
        const smartResult = await smartSearch(trimmed, { archived: false });
        searchMode = smartResult.searchMode;

        if (smartResult.searchMode === "smart" && smartResult.orderedIds.length > 0) {
          const topIds = smartResult.orderedIds.slice(0, MAX_SEARCH_RESULTS);
          count = smartResult.orderedIds.length;

          const rows = await db
            .select()
            .from(bookmarks)
            .where(inArray(bookmarks.id, topIds));

          // Sort by reranked order
          const idOrder = new Map(topIds.map((id, i) => [id, i]));
          results = rows.sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));
        }
      } catch (err) {
        logger.warn("Smart search failed in WhatsApp, falling back to basic", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Fallback to basic LIKE search (also when smart search returned 0 results)
    if (results.length === 0) {
      const conditions = [eq(bookmarks.isArchived, false)];
      const term = `%${trimmed}%`;
      conditions.push(
        or(
          like(bookmarks.title, term),
          like(bookmarks.description, term),
          like(bookmarks.url, term),
          like(bookmarks.summary, term),
          sql`EXISTS (SELECT 1 FROM json_each(${bookmarks.tags}) AS je WHERE je.value LIKE ${term})`,
        )!,
      );

      results = await db
        .select()
        .from(bookmarks)
        .where(and(...conditions))
        .orderBy(desc(bookmarks.createdAt))
        .limit(MAX_SEARCH_RESULTS);

      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(bookmarks)
        .where(and(...conditions));
      count = countResult[0]?.count ?? 0;
    }

    await sendSearchResults(sock, remoteJid, trimmed, results, count, quotedMsg, searchMode);
  } catch (error) {
    logger.error("Search command failed", { query: trimmed, error });
    await sock.sendMessage(remoteJid, {
      text: "❌ Search failed, please try again",
    }, { quoted: quotedMsg });
  }
}

async function sendSearchResults(
  sock: WASocket,
  remoteJid: string,
  query: string,
  results: any[],
  totalCount: number,
  quotedMsg: any,
  searchMode?: "smart" | "basic",
): Promise<void> {
  if (results.length === 0) {
    await sock.sendMessage(remoteJid, {
      text: `No bookmarks found for "${query}"`,
    }, { quoted: quotedMsg });
    return;
  }

  const modeLabel = searchMode === "smart" ? " ✨" : "";
  const lines = [`*Search results for "${query}":*${modeLabel}\n`];
  for (let i = 0; i < results.length; i++) {
    const b = results[i]!;
    const tags = Array.isArray(b.tags) && b.tags.length > 0
      ? `\n   ${b.tags.map((t: string) => `#${t}`).join(" ")}`
      : "";
    lines.push(`${i + 1}. ${b.title ?? b.url}\n   ${b.url}${tags}`);
  }

  if (Number(totalCount) > MAX_SEARCH_RESULTS) {
    lines.push(`\n_Showing ${MAX_SEARCH_RESULTS} of ${totalCount} results_`);
  }

  await sock.sendMessage(remoteJid, { text: lines.join("\n") }, { quoted: quotedMsg });
}
