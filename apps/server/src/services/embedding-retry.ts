import { bookmarks } from "@bookmark/db/schema/bookmarks";
import { db } from "@bookmark/db";
import { and, eq, lt, or } from "drizzle-orm";
import { isAIConfigured } from "./ai-client";
import {
  generateEmbedding,
  buildEmbeddingText,
  serializeEmbedding,
} from "./embedding-service";
import { setEmbeddingCacheEntry } from "./embedding-cache";
import { logger } from "../utils/logger";

const MAX_RETRIES = 3;
// OpenRouter has no strict rate limit — process aggressively for fast catch-up
const BATCH_SIZE = 50;
const RETRY_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

let intervalId: ReturnType<typeof setInterval> | null = null;
let rateLimitedUntil = 0;

function isRateLimitError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes("429") || msg.includes("Too Many Requests") || msg.includes("quota");
}

async function retryFailedEmbeddings(): Promise<void> {
  if (!isAIConfigured()) return;

  if (Date.now() < rateLimitedUntil) {
    logger.info("Embedding retry skipped — rate limited", {
      resumeIn: `${Math.ceil((rateLimitedUntil - Date.now()) / 1000)}s`,
    });
    return;
  }

  const pendingBookmarks = await db
    .select({
      id: bookmarks.id,
      url: bookmarks.url,
      title: bookmarks.title,
      tags: bookmarks.tags,
      summary: bookmarks.summary,
      description: bookmarks.description,
      isArchived: bookmarks.isArchived,
      embeddingRetries: bookmarks.embeddingRetries,
    })
    .from(bookmarks)
    .where(
      and(
        or(
          eq(bookmarks.embeddingStatus, "pending"),
          eq(bookmarks.embeddingStatus, "failed"),
        ),
        lt(bookmarks.embeddingRetries, MAX_RETRIES),
      ),
    )
    .limit(BATCH_SIZE);

  if (pendingBookmarks.length === 0) return;

  logger.info("Retrying embeddings for bookmarks", {
    count: pendingBookmarks.length,
  });

  for (const bookmark of pendingBookmarks) {
    // Check rate limit before each item
    if (Date.now() < rateLimitedUntil) {
      logger.info("Stopping embedding batch — rate limited", {
        resumeIn: `${Math.ceil((rateLimitedUntil - Date.now()) / 1000)}s`,
      });
      break;
    }

    try {
      const text = buildEmbeddingText(bookmark);
      const embedding = await generateEmbedding(text);

      if (embedding) {
        const blob = serializeEmbedding(embedding);
        await db
          .update(bookmarks)
          .set({
            embedding: blob,
            embeddingStatus: "complete",
            embeddingRetries: (bookmark.embeddingRetries ?? 0) + 1,
            updatedAt: new Date(),
          })
          .where(eq(bookmarks.id, bookmark.id));

        setEmbeddingCacheEntry(bookmark.id, embedding, bookmark.isArchived);

        logger.info("Embedding generated", { id: bookmark.id, url: bookmark.url });
      } else {
        await db
          .update(bookmarks)
          .set({
            embeddingStatus: "failed",
            embeddingRetries: (bookmark.embeddingRetries ?? 0) + 1,
            updatedAt: new Date(),
          })
          .where(eq(bookmarks.id, bookmark.id));

        logger.warn("Embedding generation returned null", {
          id: bookmark.id,
          url: bookmark.url,
        });
      }
    } catch (error) {
      if (isRateLimitError(error)) {
        rateLimitedUntil = Date.now() + 60_000;
        logger.warn("Rate limited on embeddings, pausing batch");
        break;
      }

      logger.error("Embedding failed for bookmark", {
        id: bookmark.id,
        url: bookmark.url,
        error: error instanceof Error ? error.message : String(error),
      });

      try {
        await db
          .update(bookmarks)
          .set({
            embeddingStatus: "failed",
            embeddingRetries: (bookmark.embeddingRetries ?? 0) + 1,
            updatedAt: new Date(),
          })
          .where(eq(bookmarks.id, bookmark.id));
      } catch {
        // best effort
      }
    }
  }
}

export function startEmbeddingRetryJob(): void {
  intervalId = setInterval(() => {
    retryFailedEmbeddings().catch((err) => {
      logger.error("Embedding retry job failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, RETRY_INTERVAL_MS);

  // Run once immediately on startup to process any pending embeddings
  retryFailedEmbeddings().catch((err) => {
    logger.error("Initial embedding retry failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  logger.info("Embedding retry job started", {
    intervalMs: RETRY_INTERVAL_MS,
    batchSize: BATCH_SIZE,
    maxRetries: MAX_RETRIES,
  });
}

export function stopEmbeddingRetryJob(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
