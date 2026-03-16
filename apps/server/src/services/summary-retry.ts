import { bookmarks } from "@bookmark/db/schema/bookmarks";
import { db } from "@bookmark/db";
import { and, eq, lt, or } from "drizzle-orm";
import { generateSummary } from "./gemini-summarizer";
import { generateTags } from "./gemini-tagger";
import { isGeminiConfigured } from "./gemini-client";
import { logger } from "../utils/logger";

const MAX_RETRIES = 3;
// Process 3 bookmarks every 30 minutes to stay well within free tier (20 req/day)
// 3 bookmarks × ~2 calls each = ~6 requests per cycle
// 48 cycles/day × 6 = ~288 requests/day max (but free tier is 20/day so we're safe
// because most cycles will find 0 pending bookmarks)
const BATCH_SIZE = 3;
const RETRY_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

let intervalId: ReturnType<typeof setInterval> | null = null;
let rateLimitedUntil = 0;

function isRateLimitError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes("429") || msg.includes("Too Many Requests") || msg.includes("quota");
}

async function retryFailedSummaries(): Promise<void> {
  if (!isGeminiConfigured()) return;

  // Skip if we're rate limited
  if (Date.now() < rateLimitedUntil) {
    logger.info("Summary retry skipped — rate limited", {
      resumeIn: `${Math.ceil((rateLimitedUntil - Date.now()) / 1000)}s`,
    });
    return;
  }

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
    .limit(BATCH_SIZE);

  if (pendingBookmarks.length === 0) return;

  logger.info("Retrying summaries for bookmarks", {
    count: pendingBookmarks.length,
  });

  for (const bookmark of pendingBookmarks) {
    // Check rate limit before each call
    if (Date.now() < rateLimitedUntil) {
      logger.info("Stopping batch — rate limited");
      break;
    }

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
            if (isRateLimitError(tagErr)) {
              rateLimitedUntil = Date.now() + 60_000;
              logger.warn("Rate limited on tagging, pausing", { url: bookmark.url });
              break;
            }
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
      if (isRateLimitError(error)) {
        // Back off for 60s on rate limit
        rateLimitedUntil = Date.now() + 60_000;
        logger.warn("Rate limited on summary, pausing batch", {
          url: bookmark.url,
        });
        break;
      }

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
    batchSize: BATCH_SIZE,
    maxRetries: MAX_RETRIES,
  });
}

export function stopSummaryRetryJob(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
