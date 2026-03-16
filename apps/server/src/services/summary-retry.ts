import { bookmarks } from "@bookmark/db/schema/bookmarks";
import { db } from "@bookmark/db";
import { and, eq, lt, or, sql } from "drizzle-orm";
import { generateSummary } from "./gemini-summarizer";
import { generateTags } from "./gemini-tagger";
import { isAIConfigured } from "./ai-client";
import { logger } from "../utils/logger";

const MAX_RETRIES = 3;
const BATCH_SIZE = 50;
// Fallback interval — only matters if processAllPendingSummaries wasn't triggered
const RETRY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let intervalId: ReturnType<typeof setInterval> | null = null;
let rateLimitedUntil = 0;
let processing = false;

function isRateLimitError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes("429") || msg.includes("Too Many Requests") || msg.includes("quota");
}

async function processSingleBookmark(bookmark: Awaited<ReturnType<typeof getPendingBatch>>[number]): Promise<boolean> {
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
          embeddingStatus: "pending",
          updatedAt: new Date(),
        })
        .where(eq(bookmarks.id, bookmark.id));

      logger.info("Summary generated", { id: bookmark.id, url: bookmark.url });

      // Auto-tag if bookmark has no tags
      const currentTags = Array.isArray(bookmark.tags) ? bookmark.tags : [];
      if (currentTags.length === 0) {
        try {
          const aiTags = await generateTags(bookmark.url, bookmark.title, bookmark.description);
          if (aiTags.length > 0) {
            await db
              .update(bookmarks)
              .set({ tags: aiTags, updatedAt: new Date() })
              .where(eq(bookmarks.id, bookmark.id));
            logger.info("Auto-tags generated", { id: bookmark.id, tags: aiTags });
          }
        } catch (tagErr) {
          if (isRateLimitError(tagErr)) {
            rateLimitedUntil = Date.now() + 60_000;
            return false; // signal to stop
          }
          logger.warn("Auto-tagging failed", {
            id: bookmark.id,
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

      logger.warn("Summary returned null", { id: bookmark.id, url: bookmark.url });
    }
    return true; // continue
  } catch (error) {
    if (isRateLimitError(error)) {
      rateLimitedUntil = Date.now() + 60_000;
      return false; // signal to stop
    }

    logger.error("Summary failed", {
      id: bookmark.id,
      url: bookmark.url,
      error: error instanceof Error ? error.message : String(error),
    });

    try {
      await db
        .update(bookmarks)
        .set({
          summaryStatus: "failed",
          summaryRetries: (bookmark.summaryRetries ?? 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(bookmarks.id, bookmark.id));
    } catch {
      // best effort
    }
    return true; // continue with next
  }
}

async function getPendingBatch() {
  return db
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
    .limit(BATCH_SIZE);
}

/**
 * Process ALL pending summaries in a loop until none remain.
 * Stops on rate limit, resumes on next call.
 */
export async function processAllPendingSummaries(): Promise<void> {
  if (!isAIConfigured()) return;
  if (processing) {
    logger.info("Summary processing already running, skipping");
    return;
  }

  processing = true;
  let totalProcessed = 0;

  try {
    // Count total pending for logging
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(bookmarks)
      .where(
        and(
          or(
            eq(bookmarks.summaryStatus, "pending"),
            eq(bookmarks.summaryStatus, "failed"),
          ),
          lt(bookmarks.summaryRetries, MAX_RETRIES),
        ),
      );
    const totalPending = countResult?.count ?? 0;

    if (totalPending === 0) return;

    logger.info("Processing all pending summaries", { totalPending });

    while (true) {
      if (Date.now() < rateLimitedUntil) {
        logger.info("Summary processing paused — rate limited", {
          processed: totalProcessed,
          resumeIn: `${Math.ceil((rateLimitedUntil - Date.now()) / 1000)}s`,
        });
        break;
      }

      const batch = await getPendingBatch();
      if (batch.length === 0) break;

      for (const bookmark of batch) {
        if (Date.now() < rateLimitedUntil) break;

        const shouldContinue = await processSingleBookmark(bookmark);
        if (!shouldContinue) break;
        totalProcessed++;
      }
    }

    if (totalProcessed > 0) {
      logger.info("Summary processing complete", { totalProcessed });
    }
  } finally {
    processing = false;
  }
}

export function startSummaryRetryJob(): void {
  // Fallback interval for any stragglers/failures
  intervalId = setInterval(() => {
    processAllPendingSummaries().catch((err) => {
      logger.error("Summary retry job failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, RETRY_INTERVAL_MS);

  // Process everything immediately on startup
  processAllPendingSummaries().catch((err) => {
    logger.error("Initial summary processing failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  logger.info("Summary retry job started", { intervalMs: RETRY_INTERVAL_MS });
}

export function stopSummaryRetryJob(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
