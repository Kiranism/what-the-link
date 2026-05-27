import { bookmarks } from "@bookmark/db/schema/bookmarks";
import { db } from "@bookmark/db";
import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { smartSearch, isAIConfigured } from "../smart-search";
import { logger } from "../../utils/logger";
import type { WASocket } from "@whiskeysockets/baileys";

const MAX_SEARCH_RESULTS = 5;
const MAX_SHOP_ITEMS = 15;
const SHOP_MENU_TTL_MS = 5 * 60_000;

type ShopMenuState = {
  categories: string[];
  menuMessageId?: string;
  expiresAt: number;
};

const shopMenus = new Map<string, ShopMenuState>();

function getActiveShopMenu(jid: string): ShopMenuState | null {
  const m = shopMenus.get(jid);
  if (!m) return null;
  if (Date.now() > m.expiresAt) {
    shopMenus.delete(jid);
    return null;
  }
  return m;
}

function setShopMenu(jid: string, categories: string[], menuMessageId?: string): void {
  shopMenus.set(jid, {
    categories,
    menuMessageId,
    expiresAt: Date.now() + SHOP_MENU_TTL_MS,
  });
}

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

/**
 * Returns true if the text is exactly "?help" (trimmed, case-insensitive).
 */
export function extractHelpCommand(text: string): boolean {
  return text.trim().toLowerCase() === "?help";
}

export async function handleHelpCommand(
  sock: WASocket,
  remoteJid: string,
  quotedMsg: any,
): Promise<void> {
  const helpText = `*Bookmark Bot Commands:*

📌 *Save a link*
Send any URL (with optional #tags)
Example: https://example.com #design

📝 *Save a note*
Send any text without a URL
Example: Check out that new CSS framework next week

🔍 *Search*
?query — semantic + text search
?#tag — filter by tag
?recent — last 5 bookmarks
?recent 10 — last 10 bookmarks

🛍 *Shop*
?shop — list product categories you saved
?shop watches — list products in a category
After ?shop, reply with the number (e.g. 1) or quote the menu

?help — show this help

All links are auto-tagged and summarized by AI.`;

  await sock.sendMessage(remoteJid, { text: helpText }, { quoted: quotedMsg });
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

  // Special keyword: "recent" or "recent N"
  const recentMatch = trimmed.match(/^recent(?:\s+(\d+))?$/i);
  if (recentMatch) {
    const requestedCount = recentMatch[1] ? Math.min(parseInt(recentMatch[1], 10), 20) : MAX_SEARCH_RESULTS;
    const recentLimit = requestedCount > 0 ? requestedCount : MAX_SEARCH_RESULTS;
    try {
      const conditions = [eq(bookmarks.isArchived, false)];
      const results = await db
        .select()
        .from(bookmarks)
        .where(and(...conditions))
        .orderBy(desc(bookmarks.createdAt))
        .limit(recentLimit);

      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(bookmarks)
        .where(and(...conditions));
      const count = countResult[0]?.count ?? 0;

      await sendSearchResults(sock, remoteJid, trimmed, results, count, quotedMsg, undefined, recentLimit);
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
    let searchMode: "smart" | "basic" | "semantic" = "basic";

    if (isAIConfigured()) {
      try {
        const smartResult = await smartSearch(trimmed, { archived: false });
        searchMode = smartResult.searchMode;

        if ((smartResult.searchMode === "smart" || smartResult.searchMode === "semantic") && smartResult.orderedIds.length > 0) {
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
  searchMode?: "smart" | "basic" | "semantic",
  displayLimit?: number,
): Promise<void> {
  if (results.length === 0) {
    await sock.sendMessage(remoteJid, {
      text: `No bookmarks found for "${query}"`,
    }, { quoted: quotedMsg });
    return;
  }

  const limit = displayLimit ?? MAX_SEARCH_RESULTS;
  const modeLabel = searchMode === "smart" || searchMode === "semantic" ? " ✨" : "";
  const lines = [`*Search results for "${query}":*${modeLabel}\n`];
  for (let i = 0; i < results.length; i++) {
    const b = results[i]!;
    const summarySnippet = b.summary
      ? `\n   ${b.summary.length > 100 ? b.summary.slice(0, 100) + "..." : b.summary}`
      : "";
    const tags = Array.isArray(b.tags) && b.tags.length > 0
      ? `\n   ${b.tags.map((t: string) => `#${t}`).join(" ")}`
      : "";
    lines.push(`${i + 1}. ${b.title ?? b.url}\n   ${b.url}${summarySnippet}${tags}`);
  }

  if (Number(totalCount) > limit) {
    lines.push(`\n_Showing ${limit} of ${totalCount} results_`);
  }

  await sock.sendMessage(remoteJid, { text: lines.join("\n") }, { quoted: quotedMsg });
}

// =====================================================================
// Shop commands: ?shop, ?shop <category>, numbered/quoted reply drill-in
// =====================================================================

export type ShopCommand =
  | { kind: "menu" }
  | { kind: "items"; category: string };

/** "?shop" → menu, "?shop watches" → items. Returns null when not a shop command. */
export function extractShopCommand(text: string): ShopCommand | null {
  const lower = text.trim().toLowerCase();
  if (!lower.startsWith("?shop")) return null;
  // Reject "?shopping" or other prefix collisions
  const after = lower.slice(5);
  if (after !== "" && !after.startsWith(" ")) return null;
  const rest = after.trim();
  if (rest === "") return { kind: "menu" };
  return { kind: "items", category: rest };
}

/**
 * Bare number ("1") or category-name reply resolves against the last `?shop`
 * menu for this chat (5 min TTL). Quoted replies are accepted only when the
 * quoted message is the menu we sent.
 */
export function extractShopMenuReply(
  text: string,
  contextInfo: { stanzaId?: string } | undefined,
  jid: string,
): { category: string } | null {
  const menu = getActiveShopMenu(jid);
  if (!menu) return null;
  const trimmed = text.trim().toLowerCase();

  const isQuotedReply = !!contextInfo?.stanzaId;
  if (isQuotedReply) {
    // Only accept quoted replies that point at the menu message itself
    if (contextInfo.stanzaId !== menu.menuMessageId) return null;
  } else {
    // Bare reply: must look like a menu choice — number or known category
    const isDigit = /^\d{1,2}$/.test(trimmed);
    if (!isDigit && !menu.categories.includes(trimmed)) return null;
  }

  if (/^\d{1,2}$/.test(trimmed)) {
    const idx = parseInt(trimmed, 10) - 1;
    const category = menu.categories[idx];
    return category ? { category } : null;
  }
  if (menu.categories.includes(trimmed)) return { category: trimmed };
  return null;
}

export async function handleShopMenuCommand(
  sock: WASocket,
  remoteJid: string,
  quotedMsg: any,
): Promise<void> {
  const rows = await db
    .select({ tags: bookmarks.tags })
    .from(bookmarks)
    .where(and(eq(bookmarks.collection, "shopping"), eq(bookmarks.isArchived, false)));

  if (rows.length === 0) {
    await sock.sendMessage(
      remoteJid,
      { text: "_No shop products yet. Share a Myntra / Amazon / Flipkart link to get started._" },
      { quoted: quotedMsg },
    );
    return;
  }

  const counts = new Map<string, number>();
  for (const row of rows) {
    const tags = Array.isArray(row.tags) ? row.tags : [];
    const category = (tags[0] ?? "other").toLowerCase();
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const categories = sorted.map(([c]) => c);

  const lines = ["*🛍 Your shop collection*", ""];
  sorted.forEach(([cat, count], i) => {
    lines.push(`${i + 1}. ${cat} (${count})`);
  });
  lines.push("");
  lines.push("_Reply with the number, the category name, or quote this message._");

  const sent = await sock.sendMessage(
    remoteJid,
    { text: lines.join("\n") },
    { quoted: quotedMsg },
  );
  setShopMenu(remoteJid, categories, sent?.key?.id ?? undefined);
}

export async function handleShopItemsCommand(
  sock: WASocket,
  remoteJid: string,
  category: string,
  quotedMsg: any,
): Promise<void> {
  const cat = category.trim().toLowerCase();
  const rows = await db
    .select()
    .from(bookmarks)
    .where(and(eq(bookmarks.collection, "shopping"), eq(bookmarks.isArchived, false)))
    .orderBy(desc(bookmarks.createdAt));

  const filtered = rows.filter((r) => {
    const tags = Array.isArray(r.tags) ? r.tags : [];
    return (tags[0] ?? "other").toLowerCase() === cat;
  });

  if (filtered.length === 0) {
    await sock.sendMessage(
      remoteJid,
      { text: `_No products in "${cat}" yet._` },
      { quoted: quotedMsg },
    );
    return;
  }

  const visible = filtered.slice(0, MAX_SHOP_ITEMS);
  const lines = [`*${cat}* (${filtered.length})`, ""];
  visible.forEach((b, i) => {
    lines.push(`${i + 1}. ${b.title ?? b.url}\n   ${b.url}`);
  });
  if (filtered.length > visible.length) {
    lines.push(`\n_Showing ${visible.length} of ${filtered.length}_`);
  }

  await sock.sendMessage(remoteJid, { text: lines.join("\n") }, { quoted: quotedMsg });
}
