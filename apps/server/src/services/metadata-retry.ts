import { bookmarks } from "@bookmark/db/schema/bookmarks";
import { db } from "./db";
import { and, eq, lt } from "drizzle-orm";
import { fetchMetadata } from "./metadata";
import { logger } from "../utils/logger";

const MAX_RETRIES = 3;
const RETRY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let intervalId: ReturnType<typeof setInterval> | null = null;

async function retryFailedMetadata(): Promise<void> {
  const failedBookmarks = await db
    .select()
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.metadataStatus, "failed"),
        lt(bookmarks.metadataRetries, MAX_RETRIES),
      ),
    )
    .limit(10);

  if (failedBookmarks.length === 0) return;

  logger.info("Retrying metadata for failed bookmarks", {
    count: failedBookmarks.length,
  });

  for (const bookmark of failedBookmarks) {
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
      logger.error("Metadata retry error", {
        url: bookmark.url,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export function startMetadataRetryJob(): void {
  intervalId = setInterval(() => {
    retryFailedMetadata().catch((err) => {
      logger.error("Metadata retry job failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, RETRY_INTERVAL_MS);

  logger.info("Metadata retry job started", {
    intervalMs: RETRY_INTERVAL_MS,
    maxRetries: MAX_RETRIES,
  });
}

export function stopMetadataRetryJob(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
