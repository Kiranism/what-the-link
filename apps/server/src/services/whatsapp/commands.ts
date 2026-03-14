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
  if (!trimmed) {
    await sock.sendMessage(remoteJid, {
      text: "Usage: search <query>\n\nExamples:\n• search react hooks\n• search #tutorial\n• search fav\n• search recent",
    }, { quoted: quotedMsg });
    return;
  }

  const conditions = [eq(bookmarks.isArchived, false)];

  // Special keyword: "fav" or "favorites"
  if (trimmed === "fav" || trimmed === "favorites" || trimmed === "⭐") {
    conditions.push(eq(bookmarks.isFavorite, true));
  }
  // Tag search: starts with #
  else if (trimmed.startsWith("#")) {
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
      const fav = b.isFavorite ? " ⭐" : "";
      lines.push(`${i + 1}. ${b.title ?? b.url}${fav}\n   ${b.url}${tags}`);
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

export async function handleReplyCommand(
  sock: WASocket,
  remoteJid: string,
  command: string,
  quotedStanzaId: string,
  msg: any,
): Promise<void> {
  try {
    const [bookmark] = await db
      .select()
      .from(bookmarks)
      .where(eq(bookmarks.whatsappMessageId, quotedStanzaId))
      .limit(1);

    if (bookmark) {
      let replyText = "";
      if (command === "delete") {
        await db.delete(bookmarks).where(eq(bookmarks.id, bookmark.id));
        replyText = "🗑️ deleted";
      } else if (command === "archive") {
        await db.update(bookmarks).set({ isArchived: true, updatedAt: new Date() }).where(eq(bookmarks.id, bookmark.id));
        replyText = "📦 archived";
      } else if (command === "fav" || command === "favorite") {
        await db.update(bookmarks).set({ isFavorite: true, updatedAt: new Date() }).where(eq(bookmarks.id, bookmark.id));
        replyText = "⭐ favorited";
      } else if (command === "unfav") {
        await db.update(bookmarks).set({ isFavorite: false, updatedAt: new Date() }).where(eq(bookmarks.id, bookmark.id));
        replyText = "☆ unfavorited";
      }

      if (replyText) {
        await sock.sendMessage(remoteJid, { text: replyText }, { quoted: msg });
      }
      logger.info("Reply command processed", { command, bookmarkId: bookmark.id });
    } else {
      await sock.sendMessage(remoteJid, { text: "⚠️ bookmark not found for that message" }, { quoted: msg });
    }
  } catch (error) {
    logger.error("Reply command failed", { command, error });
  }
}

export const HELP_TEXT = `*Bookmark Bot Commands:*

*Save a bookmark:* Send any URL
  • Add tags: include #tag1 #tag2
  • Mark favorite: add !fav or ⭐

*Search:*
  • search <query> — text search
  • search #tag — filter by tag
  • search fav — list favorites
  • search recent — latest bookmarks
  • ?<query> — quick search
    e.g. ?nykaa, ?react tutorials

*Reply commands:* (reply to a saved bookmark)
  • delete — remove bookmark
  • archive — archive it
  • fav — mark favorite
  • unfav — remove favorite`;
