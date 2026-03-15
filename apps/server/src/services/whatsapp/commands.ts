import { bookmarks } from "@bookmark/db/schema/bookmarks";
import { db } from "@bookmark/db";
import { and, desc, eq, like, or, sql } from "drizzle-orm";
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

  const conditions = [eq(bookmarks.isArchived, false)];

  // Tag search: starts with #
  if (trimmed.startsWith("#")) {
    const tag = trimmed.slice(1).toLowerCase();
    if (tag) {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM json_each(${bookmarks.tags}) AS je
          WHERE je.value = ${tag}
        )`,
      );
    }
  }
  // Special keyword: "recent"
  else if (trimmed === "recent") {
    // No extra filter — just fetch latest
  }
  // General text search
  else {
    const term = `%${trimmed}%`;
    conditions.push(
      or(
        like(bookmarks.title, term),
        like(bookmarks.description, term),
        like(bookmarks.url, term),
      )!,
    );
  }

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

    if (results.length === 0) {
      await sock.sendMessage(remoteJid, {
        text: `No bookmarks found for "${trimmed}"`,
      }, { quoted: quotedMsg });
      return;
    }

    const lines = [`*Search results for "${trimmed}":*\n`];
    for (let i = 0; i < results.length; i++) {
      const b = results[i]!;
      const tags = Array.isArray(b.tags) && b.tags.length > 0
        ? `\n   ${b.tags.map((t: string) => `#${t}`).join(" ")}`
        : "";
      lines.push(`${i + 1}. ${b.title ?? b.url}\n   ${b.url}${tags}`);
    }

    if (Number(count) > MAX_SEARCH_RESULTS) {
      lines.push(`\n_Showing ${MAX_SEARCH_RESULTS} of ${count} results_`);
    }

    await sock.sendMessage(remoteJid, { text: lines.join("\n") }, { quoted: quotedMsg });
  } catch (error) {
    logger.error("Search command failed", { query: trimmed, error });
    await sock.sendMessage(remoteJid, {
      text: "❌ Search failed, please try again",
    }, { quoted: quotedMsg });
  }
}

