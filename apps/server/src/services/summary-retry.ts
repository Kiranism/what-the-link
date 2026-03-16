import { bookmarks } from "@bookmark/db/schema/bookmarks";
import { db } from "@bookmark/db";
import { and, eq, lt, or } from "drizzle-orm";
import { generateSummary } from "./gemini-summarizer";
import { generateTags } from "./gemini-tagger";
import { isGeminiConfigured } from "./gemini-client";
import { logger } from "../utils/logger";

const MAX_RETRIES = 3;
const RETRY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let intervalId: ReturnType<typeof setInterval> | null = null;

async function retryFailedSummaries(): Promise<void> {
  if (!isGeminiConfigured()) return;

  const pendingBookmarks = await db
    .select()
    .from(bookmarks)
    .where(
      and(
        or(
          eq(bookmarks.summaryStatus, "pending"),
          eq(bookmarks.summaryStatus, "failed"),
        ),
        lt(bookmarks.summaryRetries, MAX_RETRIES),
      ),
    )
    .limit(10);

  if (pendingBookmarks.length === 0) return;

  logger.info("Retrying summaries for bookmarks", {
    count: pendingBookmarks.length,
  });

  for (const bookmark of pendingBookmarks) {
    try {
      const summary = await generateSummary(
        bookmark.url,
        bookmark.title,
        bookmark.description,
      );

      if (summary) {
        await db
          .update(bookmarks)
          .set({
            summary,
            summaryStatus: "complete",
            summaryRetries: (bookmark.summaryRetries ?? 0) + 1,
            updatedAt: new Date(),
          })
          .where(eq(bookmarks.id, bookmark.id));

        logger.info("Summary retry succeeded", {
          url: bookmark.url,
        });

        // Also auto-tag if bookmark has no tags
        const currentTags = Array.isArray(bookmark.tags) ? bookmark.tags : [];
        if (currentTags.length === 0) {
          try {
            const aiTags = await generateTags(bookmark.url, bookmark.title, bookmark.description);
            if (aiTags.length > 0) {
              await db
                .update(bookmarks)
                .set({ tags: aiTags, updatedAt: new Date() })
                .where(eq(bookmarks.id, bookmark.id));
              logger.info("Auto-tags generated on retry", { url: bookmark.url, tags: aiTags });
            }
          } catch (tagErr) {
            logger.warn("Auto-tagging failed on retry", {
              url: bookmark.url,
              error: tagErr instanceof Error ? tagErr.message : String(tagErr),
            });
          }
        }
      } else {
        await db
          .update(bookmarks)
          .set({
            summaryStatus: "failed",
            summaryRetries: (bookmark.summaryRetries ?? 0) + 1,
            updatedAt: new Date(),
          })
          .where(eq(bookmarks.id, bookmark.id));

        logger.warn("Summary retry still failing", {
          url: bookmark.url,
          attempt: (bookmark.summaryRetries ?? 0) + 1,
        });
      }
    } catch (error) {
      logger.error("Summary retry error", {
        url: bookmark.url,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export function startSummaryRetryJob(): void {
  intervalId = setInterval(() => {
    retryFailedSummaries().catch((err) => {
      logger.error("Summary retry job failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, RETRY_INTERVAL_MS);

  logger.info("Summary retry job started", {
    intervalMs: RETRY_INTERVAL_MS,
    maxRetries: MAX_RETRIES,
  });
}

export function stopSummaryRetryJob(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
