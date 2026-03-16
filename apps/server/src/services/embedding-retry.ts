import { bookmarks } from "@bookmark/db/schema/bookmarks";
import { db } from "@bookmark/db";
import { and, eq, lt, or, sql } from "drizzle-orm";
import { isAIConfigured } from "./ai-client";
import {
  generateEmbedding,
  buildEmbeddingText,
  serializeEmbedding,
} from "./embedding-service";
import { setEmbeddingCacheEntry } from "./embedding-cache";
import { logger } from "../utils/logger";

const MAX_RETRIES = 3;
const BATCH_SIZE = 50;
// Fallback interval — only matters if processAllPendingEmbeddings wasn't triggered
const RETRY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let intervalId: ReturnType<typeof setInterval> | null = null;
let rateLimitedUntil = 0;
let processing = false;

function isRateLimitError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes("429") || msg.includes("Too Many Requests") || msg.includes("quota");
}

async function getPendingBatch() {
  return db
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
}

/**
 * Process ALL pending embeddings in a loop until none remain.
 * Stops on rate limit, resumes on next call.
 */
export async function processAllPendingEmbeddings(): Promise<void> {
  if (!isAIConfigured()) return;
  if (processing) {
    logger.info("Embedding processing already running, skipping");
    return;
  }

  processing = true;
  let totalProcessed = 0;

  try {
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(bookmarks)
      .where(
        and(
          or(
            eq(bookmarks.embeddingStatus, "pending"),
            eq(bookmarks.embeddingStatus, "failed"),
          ),
          lt(bookmarks.embeddingRetries, MAX_RETRIES),
        ),
      );
    const totalPending = countResult?.count ?? 0;

    if (totalPending === 0) return;

    logger.info("Processing all pending embeddings", { totalPending });

    while (true) {
      if (Date.now() < rateLimitedUntil) {
        logger.info("Embedding processing paused — rate limited", {
          processed: totalProcessed,
          resumeIn: `${Math.ceil((rateLimitedUntil - Date.now()) / 1000)}s`,
        });
        break;
      }

      const batch = await getPendingBatch();
      if (batch.length === 0) break;

      for (const bookmark of batch) {
        if (Date.now() < rateLimitedUntil) break;

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
            totalProcessed++;

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

            logger.warn("Embedding returned null", { id: bookmark.id, url: bookmark.url });
          }
        } catch (error) {
          if (isRateLimitError(error)) {
            rateLimitedUntil = Date.now() + 60_000;
            logger.warn("Rate limited on embeddings, pausing");
            break;
          }

          logger.error("Embedding failed", {
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

    if (totalProcessed > 0) {
      logger.info("Embedding processing complete", { totalProcessed });
    }
  } finally {
    processing = false;
  }
}

export function startEmbeddingRetryJob(): void {
  // Fallback interval for any stragglers/failures
  intervalId = setInterval(() => {
    processAllPendingEmbeddings().catch((err) => {
      logger.error("Embedding retry job failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, RETRY_INTERVAL_MS);

  // NOTE: no immediate run here — the summary job chains into embeddings on startup.
  // The fallback interval catches anything that slips through.

  logger.info("Embedding retry job started", { intervalMs: RETRY_INTERVAL_MS });
}

export function stopEmbeddingRetryJob(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
