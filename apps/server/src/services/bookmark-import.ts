import * as cheerio from "cheerio";
import { bookmarks } from "@bookmark/db/schema/bookmarks";
import { db } from "@bookmark/db";
import { eq } from "drizzle-orm";
import { fetchMetadata } from "./metadata";
import { generateSummary } from "./gemini-summarizer";
import { generateTags } from "./gemini-tagger";
import { isGeminiConfigured } from "./gemini-client";
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

/**
 * Import parsed bookmarks into the database.
 * Skips duplicates, fetches metadata, triggers AI summary + tags.
 */
export async function importBookmarks(
  parsed: ParsedBookmark[],
  onProgress?: (done: number, total: number) => void,
): Promise<ImportResult> {
  const result: ImportResult = { total: parsed.length, imported: 0, duplicates: 0, failed: 0 };
  const geminiReady = isGeminiConfigured();

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
        onProgress?.(i + 1, parsed.length);
        continue;
      }

      // Fetch metadata (with AI fallback for blocked sites)
      const metadata = await fetchMetadata(bm.url);

      const title = metadata.title || bm.title || bm.url;
      const folderTag = bm.folder ? [bm.folder] : [];

      const createdAt = bm.addDate
        ? new Date(bm.addDate * 1000)
        : new Date();

      const [inserted] = await db.insert(bookmarks).values({
        url: bm.url,
        title,
        description: metadata.description ?? null,
        image: metadata.image ?? null,
        favicon: metadata.favicon ?? null,
        domain: metadata.domain,
        tags: folderTag,
        source: "import",
        metadataStatus: metadata.success ? "complete" : "failed",
        summaryStatus: geminiReady ? "pending" : "skipped",
        createdAt,
      }).returning();

      result.imported++;

      // Fire-and-forget: AI summary + auto-tags
      if (geminiReady && inserted) {
        const metaTitle = title;
        const metaDesc = metadata.description ?? null;

        generateSummary(bm.url, metaTitle, metaDesc)
          .then(async (summary) => {
            if (summary) {
              await db
                .update(bookmarks)
                .set({ summary, summaryStatus: "complete", updatedAt: new Date() })
                .where(eq(bookmarks.id, inserted.id));
            } else {
              await db
                .update(bookmarks)
                .set({ summaryStatus: "failed", updatedAt: new Date() })
                .where(eq(bookmarks.id, inserted.id));
            }
          })
          .catch((err) => {
            logger.error("Import summary error", {
              url: bm.url,
              error: err instanceof Error ? err.message : String(err),
            });
          });

        // Auto-tag (merge with folder tag)
        generateTags(bm.url, metaTitle, metaDesc)
          .then(async (aiTags) => {
            if (aiTags.length > 0) {
              const merged = Array.from(new Set([...folderTag, ...aiTags]));
              await db
                .update(bookmarks)
                .set({ tags: merged, updatedAt: new Date() })
                .where(eq(bookmarks.id, inserted.id));
            }
          })
          .catch((err) => {
            logger.error("Import auto-tag error", {
              url: bm.url,
              error: err instanceof Error ? err.message : String(err),
            });
          });
      }
    } catch (error) {
      result.failed++;
      logger.error("Import bookmark failed", {
        url: bm.url,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    onProgress?.(i + 1, parsed.length);
  }

  return result;
}
