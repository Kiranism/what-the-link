import * as cheerio from "cheerio";
import { bookmarks } from "@bookmark/db/schema/bookmarks";
import { db } from "@bookmark/db";
import { eq } from "drizzle-orm";
import { isAIConfigured } from "./ai-client";
import { processAllPendingSummaries } from "./summary-retry";
import { processAllPendingEmbeddings } from "./embedding-retry";
import { logger } from "../utils/logger";

interface ParsedBookmark {
  url: string;
  title: string;
  addDate?: number; // unix timestamp
  folder?: string;  // parent folder name → used as tag
}

/**
 * Parse Chrome/Brave/Firefox bookmark export HTML (Netscape Bookmark Format).
 * Returns flat list of bookmarks with their folder path as potential tags.
 */
export function parseBookmarkHtml(html: string): ParsedBookmark[] {
  const $ = cheerio.load(html);
  const results: ParsedBookmark[] = [];

  function walk(elements: cheerio.Cheerio<any>, folder: string | undefined) {
    elements.each((_, el) => {
      const $el = $(el);
      const tagName = (el as any).tagName?.toLowerCase?.();

      if (el.type === "tag" && tagName === "dt") {
        // Check if this DT contains an <A> (bookmark) or <H3> (folder)
        const $a = $el.children("a").first();
        const $h3 = $el.children("h3").first();

        if ($a.length > 0) {
          const url = $a.attr("href")?.trim();
          if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
            const title = $a.text().trim();
            const addDateStr = $a.attr("add_date");
            const addDate = addDateStr ? parseInt(addDateStr, 10) : undefined;

            results.push({
              url,
              title: title || url,
              addDate: addDate && !isNaN(addDate) ? addDate : undefined,
              folder: folder || undefined,
            });
          }
        }

        if ($h3.length > 0) {
          const folderName = $h3.text().trim().toLowerCase();
          // Skip browser default folders
          const skipFolders = ["bookmarks bar", "bookmarks toolbar", "other bookmarks", "mobile bookmarks", "bookmarks menu"];
          const nextFolder = skipFolders.includes(folderName) ? folder : folderName;

          // Process the DL inside this DT
          const $dl = $el.children("dl").first();
          if ($dl.length > 0) {
            walk($dl.children(), nextFolder);
          }
        }
      } else if (el.type === "tag" && tagName === "dl") {
        walk($el.children(), folder);
      }
    });
  }

  walk($("body").children(), undefined);
  return results;
}

export interface ImportResult {
  total: number;
  imported: number;
  duplicates: number;
  failed: number;
}

export interface ImportStatus {
  state: "idle" | "importing" | "complete" | "error";
  progress?: { done: number; total: number };
  result?: ImportResult;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

let currentImport: ImportStatus = { state: "idle" };

export function getImportStatus(): ImportStatus {
  return { ...currentImport };
}

export function clearImportStatus(): void {
  if (currentImport.state !== "importing") {
    currentImport = { state: "idle" };
  }
}

/**
 * Import parsed bookmarks into the database.
 * Skips duplicates, fetches metadata, triggers AI summary + tags.
 */
export async function importBookmarks(
  parsed: ParsedBookmark[],
): Promise<ImportResult> {
  const result: ImportResult = { total: parsed.length, imported: 0, duplicates: 0, failed: 0 };
  const aiReady = isAIConfigured();

  currentImport = {
    state: "importing",
    progress: { done: 0, total: parsed.length },
    startedAt: Date.now(),
  };

  for (let i = 0; i < parsed.length; i++) {
    const bm = parsed[i]!;
    try {
      // Check duplicate
      const [existing] = await db
        .select({ id: bookmarks.id })
        .from(bookmarks)
        .where(eq(bookmarks.url, bm.url))
        .limit(1);

      if (existing) {
        result.duplicates++;
        currentImport.progress = { done: i + 1, total: parsed.length };
        continue;
      }

      // Use title from the HTML export file directly — skip metadata
      // fetching and AI calls to avoid exhausting API rate limits.
      // The background retry job will enrich them gradually.
      const domain = new URL(bm.url).hostname;
      const favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
      const title = bm.title || bm.url;
      const folderTag = bm.folder ? [bm.folder] : [];

      const createdAt = bm.addDate
        ? new Date(bm.addDate * 1000)
        : new Date();

      await db.insert(bookmarks).values({
        url: bm.url,
        title,
        description: null,
        image: null,
        favicon,
        domain,
        tags: folderTag,
        source: "import",
        metadataStatus: "failed",
        summaryStatus: aiReady ? "pending" : "skipped",
        createdAt,
      });

      result.imported++;

      // AI summary + auto-tags are NOT fired during import to avoid
      // exhausting API rate limits. Bookmarks are saved with
      // summaryStatus: "pending" and the background retry job
      // (every 5 min, batch of 10) will process them gradually.
    } catch (error) {
      result.failed++;
      logger.error("Import bookmark failed", {
        url: bm.url,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    currentImport.progress = { done: i + 1, total: parsed.length };
  }

  currentImport = {
    state: "complete",
    result,
    completedAt: Date.now(),
    startedAt: currentImport.startedAt,
  };

  // Fire-and-forget: immediately start processing all pending AI enrichment
  if (result.imported > 0) {
    logger.info("Import done, triggering AI enrichment", { imported: result.imported });
    processAllPendingSummaries()
      .then(() => processAllPendingEmbeddings())
      .catch((err) => {
        logger.error("Post-import AI enrichment failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      });
  }

  return result;
}
