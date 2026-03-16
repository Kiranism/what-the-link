import { bookmarks } from "@bookmark/db/schema/bookmarks";
import { db } from "@bookmark/db";
import { and, eq, lt } from "drizzle-orm";
import { schedule, type ScheduledTask } from "node-cron";
import { fetchMetadata } from "./metadata";
import { logger } from "../utils/logger";

const MAX_RETRIES = 3;
const BATCH_SIZE = 3;

let task: ScheduledTask | null = null;
let rateLimitedUntil = 0;

function isRateLimitError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes("429") || msg.includes("Too Many Requests") || msg.includes("quota");
}

async function retryFailedMetadata(): Promise<void> {
  if (Date.now() < rateLimitedUntil) {
    logger.info("Metadata retry skipped — rate limited", {
      resumeIn: `${Math.ceil((rateLimitedUntil - Date.now()) / 1000)}s`,
    });
    return;
  }

  const failedBookmarks = await db
    .select()
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.metadataStatus, "failed"),
        lt(bookmarks.metadataRetries, MAX_RETRIES),
      ),
    )
    .limit(BATCH_SIZE);

  if (failedBookmarks.length === 0) return;

  logger.info("Retrying metadata for failed bookmarks", {
    count: failedBookmarks.length,
  });

  for (const bookmark of failedBookmarks) {
    if (Date.now() < rateLimitedUntil) {
      logger.info("Stopping metadata batch — rate limited");
      break;
    }

    try {
      const metadata = await fetchMetadata(bookmark.url);

      if (metadata.success) {
        await db
          .update(bookmarks)
          .set({
            title: metadata.title ?? bookmark.title,
            description: metadata.description ?? bookmark.description,
            image: metadata.image ?? bookmark.image,
            favicon: metadata.favicon ?? bookmark.favicon,
            metadataStatus: "complete",
            metadataRetries: (bookmark.metadataRetries ?? 0) + 1,
            updatedAt: new Date(),
          })
          .where(eq(bookmarks.id, bookmark.id));

        // If summary was failed/skipped, reset to pending so the summary
        // retry job can re-process with the newly fetched metadata
        if (bookmark.summaryStatus !== "complete") {
          await db
            .update(bookmarks)
            .set({ summaryStatus: "pending", summaryRetries: 0 })
            .where(eq(bookmarks.id, bookmark.id));
        }

        logger.info("Metadata retry succeeded", {
          url: bookmark.url,
          title: metadata.title,
        });
      } else {
        await db
          .update(bookmarks)
          .set({
            metadataRetries: (bookmark.metadataRetries ?? 0) + 1,
            updatedAt: new Date(),
          })
          .where(eq(bookmarks.id, bookmark.id));

        logger.warn("Metadata retry still failing", {
          url: bookmark.url,
          attempt: (bookmark.metadataRetries ?? 0) + 1,
        });
      }
    } catch (error) {
      if (isRateLimitError(error)) {
        rateLimitedUntil = Date.now() + 60_000;
        logger.warn("Rate limited on metadata fetch, pausing batch", {
          url: bookmark.url,
        });
        break;
      }

      logger.error("Metadata retry error", {
        url: bookmark.url,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export function startMetadataRetryJob(): void {
  // Every 30 minutes
  task = schedule("*/30 * * * *", () => {
    retryFailedMetadata().catch((err) => {
      logger.error("Metadata retry job failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  });

  logger.info("Metadata retry job started", { schedule: "*/30 * * * *" });
}

export function stopMetadataRetryJob(): void {
  if (task) {
    task.stop();
    task = null;
  }
}
