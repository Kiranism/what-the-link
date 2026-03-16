import { bookmarks } from "@bookmark/db/schema/bookmarks";
import { db } from "@bookmark/db";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { schedule, type ScheduledTask } from "node-cron";
import { getSocket } from "./whatsapp/connection";
import { getCachedWaAllowedGroupJid, getCachedDigestEnabled, getCachedDigestHour } from "./settings";
import { env } from "@bookmark/env/server";
import { logger } from "../utils/logger";

let task: ScheduledTask | null = null;

/** ISO date string (YYYY-MM-DD) of the last digest we sent, to avoid duplicates. */
let lastDigestDate: string | null = null;

export function startDailyDigest(): void {
  if (task) return;

  // Check every minute at :00 seconds — hour is dynamic from DB settings
  task = schedule("* * * * *", () => {
    checkAndSendDigest().catch((err) => {
      logger.error("Daily digest check failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  });

  logger.info("Daily digest job started");
}

export function stopDailyDigest(): void {
  if (task) {
    task.stop();
    task = null;
    logger.info("Daily digest job stopped");
  }
}

async function checkAndSendDigest(): Promise<void> {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD

  // Check if digest is enabled
  if (!getCachedDigestEnabled()) return;

  // Only fire at the configured hour
  if (now.getHours() !== getCachedDigestHour()) return;

  // Only fire in the first minute of the hour to avoid sending 60 times
  if (now.getMinutes() !== 0) return;

  // Already sent today
  if (lastDigestDate === todayStr) return;

  // Need a target chat
  const groupJid =
    getCachedWaAllowedGroupJid() ??
    env.WA_ALLOWED_GROUP_JID?.trim() ??
    null;
  if (!groupJid) return;

  // Need an active socket
  const sock = getSocket();
  if (!sock) return;

  // Mark as sent immediately to avoid double-send if the query takes time
  lastDigestDate = todayStr;

  try {
    const message = await buildDigestMessage();
    if (!message) {
      logger.info("Daily digest skipped — no bookmarks saved today");
      return;
    }

    await sock.sendMessage(groupJid, { text: message });
    logger.info("Daily digest sent", { groupJid });
  } catch (err) {
    // Reset so we can retry next minute
    lastDigestDate = null;
    throw err;
  }
}

async function buildDigestMessage(): Promise<string | null> {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const todayBookmarks = await db
    .select()
    .from(bookmarks)
    .where(
      and(
        gte(bookmarks.createdAt, twentyFourHoursAgo),
        eq(bookmarks.isArchived, false),
      ),
    )
    .orderBy(desc(bookmarks.createdAt));

  if (todayBookmarks.length === 0) return null;

  const linkCount = todayBookmarks.filter((b) => !b.url.startsWith("note://")).length;
  const noteCount = todayBookmarks.length - linkCount;

  // Top tags
  const tagCounts = new Map<string, number>();
  for (const b of todayBookmarks) {
    const tags = Array.isArray(b.tags) ? b.tags : [];
    for (const t of tags) {
      tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    }
  }
  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag, count]) => `${tag} (${count})`)
    .join(", ");

  // Recent saves (max 5)
  const maxShown = 5;
  const shownBookmarks = todayBookmarks.slice(0, maxShown);
  const recentLines = shownBookmarks.map(
    (b, i) => `${i + 1}. ${b.title ?? b.url}`,
  );
  const remaining = todayBookmarks.length - maxShown;
  if (remaining > 0) {
    recentLines.push(`... and ${remaining} more`);
  }

  // Archive resurfacing: random bookmark older than 3 months
  const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const archiveRows = await db
    .select()
    .from(bookmarks)
    .where(
      and(
        lte(bookmarks.createdAt, threeMonthsAgo),
        eq(bookmarks.isArchived, false),
      ),
    )
    .orderBy(sql`RANDOM()`)
    .limit(1);

  // Assemble message
  const parts: string[] = [];
  parts.push("📊 *Daily Bookmark Digest*\n");

  const segments: string[] = [];
  if (linkCount > 0) segments.push(`*${linkCount} link${linkCount !== 1 ? "s" : ""}*`);
  if (noteCount > 0) segments.push(`*${noteCount} note${noteCount !== 1 ? "s" : ""}*`);
  parts.push(`You saved ${segments.join(" and ")} today.\n`);

  if (topTags) {
    parts.push(`🏷️ Top tags: ${topTags}\n`);
  }

  parts.push(`📌 *Recent saves:*`);
  parts.push(recentLines.join("\n"));

  if (archiveRows.length > 0) {
    const old = archiveRows[0]!;
    parts.push("");
    parts.push(`💡 *From your archive:*`);
    parts.push(old.title ?? old.url);
    if (!old.url.startsWith("note://")) {
      parts.push(old.url);
    }
  }

  parts.push("");
  parts.push("_Send ?help for commands_");

  return parts.join("\n");
}
