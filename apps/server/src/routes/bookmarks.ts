import type { NewBookmark } from "@bookmark/db/schema/bookmarks";
import { bookmarks } from "@bookmark/db/schema/bookmarks";
import { db, dbClient } from "@bookmark/db";
import { fetchMetadata } from "../services/metadata";
import { normalizeUrl } from "../utils/url-extractor";
import { generateSummary } from "../services/gemini-summarizer";
import { generateTags } from "../services/gemini-tagger";
import { isGeminiConfigured } from "../services/gemini-client";
import { smartSearch } from "../services/smart-search";
import { parseBookmarkHtml, importBookmarks, getImportStatus, clearImportStatus } from "../services/bookmark-import";
import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { logger } from "../utils/logger";

export const bookmarksRouter = new Hono();

// --- Static routes first (before /:id) ---

bookmarksRouter.get("/", async (c) => {
  const search = c.req.query("search");
  const tag = c.req.query("tag");
  const domain = c.req.query("domain");

  const unread = c.req.query("unread") === "true";
  const archived = c.req.query("archived") === "true";
  const limit = Math.min(Number(c.req.query("limit")) || 50, 100);
  const offset = Number(c.req.query("offset")) || 0;

  // Try smart search when search param exists and Gemini is configured
  if (search?.trim() && isGeminiConfigured()) {
    try {
      const { orderedIds, searchMode } = await smartSearch(search.trim(), { archived });

      if (searchMode === "smart" && orderedIds.length > 0) {
        // Fetch the bookmarks in the reranked order
        const paginatedIds = orderedIds.slice(offset, offset + limit);
        if (paginatedIds.length === 0) {
          return c.json({ bookmarks: [], total: orderedIds.length, limit, offset, searchMode });
        }

        const results = await db
          .select()
          .from(bookmarks)
          .where(inArray(bookmarks.id, paginatedIds));

        // Sort results to match the reranked order
        const idOrderMap = new Map(paginatedIds.map((id, i) => [id, i]));
        results.sort((a, b) => (idOrderMap.get(a.id) ?? 0) - (idOrderMap.get(b.id) ?? 0));

        return c.json({
          bookmarks: results,
          total: orderedIds.length,
          limit,
          offset,
          searchMode,
        });
      }
      // If smart search returned no results or fell back to basic, continue with LIKE below
    } catch (error) {
      logger.error("Smart search failed, falling back to basic search", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const conditions = [eq(bookmarks.isArchived, archived)];

  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    conditions.push(
      or(
        like(bookmarks.title, term),
        like(bookmarks.description, term),
        like(bookmarks.url, term),
        like(bookmarks.summary, term),
      )!,
    );
  }

  if (tag?.trim()) {
    const tagList = tag.split(",").map((t) => t.trim()).filter(Boolean);
    if (tagList.length > 0) {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM json_each(${bookmarks.tags}) AS je
          WHERE je.value IN (${sql.join(
            tagList.map((t) => sql`${t}`),
            sql`, `,
          )})
        )`,
      );
    }
  }

  if (domain?.trim()) {
    conditions.push(eq(bookmarks.domain, domain.trim()));
  }


  if (unread) {
    conditions.push(eq(bookmarks.isRead, false));
  }

  const whereClause = and(...conditions);

  const results = await db
    .select()
    .from(bookmarks)
    .where(whereClause)
    .orderBy(desc(bookmarks.createdAt))
    .limit(limit)
    .offset(offset);

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(bookmarks)
    .where(whereClause);
  const count = countResult[0]?.count ?? 0;

  return c.json({
    bookmarks: results,
    total: count,
    limit,
    offset,
    searchMode: "basic" as const,
  });
});

bookmarksRouter.get("/tags", async (c) => {
  const result = await dbClient.execute(
    `SELECT je.value AS tag, COUNT(*) AS count
     FROM bookmarks, json_each(bookmarks.tags) AS je
     WHERE bookmarks.is_archived = 0
     GROUP BY je.value
     ORDER BY count DESC`,
  );
  const tags = result.rows.map((row) => ({
    tag: String(row.tag),
    count: Number(row.count),
  }));
  return c.json({ tags });
});

bookmarksRouter.post("/import", async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body["file"];

    if (!file || typeof file === "string") {
      return c.json({ error: "No file uploaded. Upload an HTML bookmark export file." }, 400);
    }

    const text = await (file as File).text();
    if (!text.includes("<DT>") && !text.includes("<dt>")) {
      return c.json({ error: "Invalid bookmark file. Export bookmarks as HTML from your browser." }, 400);
    }

    const parsed = parseBookmarkHtml(text);
    if (parsed.length === 0) {
      return c.json({ error: "No bookmarks found in the uploaded file." }, 400);
    }

    logger.info("Starting bookmark import", { count: parsed.length });

    const result = await importBookmarks(parsed);

    logger.info("Bookmark import complete", { ...result });

    return c.json({ ...result });
  } catch (error) {
    logger.error("Bookmark import failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json({ error: "Import failed. Check the file format." }, 500);
  }
});

bookmarksRouter.get("/import/status", async (c) => {
  const importStatus = getImportStatus();

  // Also return AI enrichment stats
  const aiStats = await db
    .select({
      status: bookmarks.summaryStatus,
      count: sql<number>`count(*)`,
    })
    .from(bookmarks)
    .groupBy(bookmarks.summaryStatus);

  const enrichment: Record<string, number> = {};
  for (const row of aiStats) {
    enrichment[row.status] = row.count;
  }

  return c.json({
    import: importStatus,
    enrichment,
  });
});

bookmarksRouter.post("/retry-ai", async (c) => {
  // Reset all stuck bookmarks (failed with max retries) so the background job retries them
  const result = await db
    .update(bookmarks)
    .set({
      summaryStatus: "pending",
      summaryRetries: 0,
      updatedAt: new Date(),
    })
    .where(
      and(
        or(
          eq(bookmarks.summaryStatus, "failed"),
          eq(bookmarks.summaryStatus, "skipped"),
        ),
      ),
    )
    .returning({ id: bookmarks.id });

  logger.info("Reset stuck bookmarks for AI retry", { count: result.length });
  return c.json({ reset: result.length });
});

bookmarksRouter.delete("/import/status", async (c) => {
  clearImportStatus();
  return c.json({ success: true });
});

bookmarksRouter.post("/bulk", async (c) => {
  const body = (await c.req.json()) as {
    ids: number[];
    action: string;
    tags?: string[];
  };

  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return c.json({ error: "ids array is required" }, 400);
  }

  const ids = body.ids.filter((id) => typeof id === "number" && !Number.isNaN(id));
  if (ids.length === 0) {
    return c.json({ error: "No valid IDs provided" }, 400);
  }

  const now = new Date();

  switch (body.action) {
    case "archive":
      await db.update(bookmarks).set({ isArchived: true, updatedAt: now }).where(inArray(bookmarks.id, ids));
      break;
    case "unarchive":
      await db.update(bookmarks).set({ isArchived: false, updatedAt: now }).where(inArray(bookmarks.id, ids));
      break;

    case "markRead":
      await db.update(bookmarks).set({ isRead: true, updatedAt: now }).where(inArray(bookmarks.id, ids));
      break;
    case "delete":
      await db.delete(bookmarks).where(inArray(bookmarks.id, ids));
      break;
    case "addTags": {
      if (!Array.isArray(body.tags) || body.tags.length === 0) {
        return c.json({ error: "tags array required for addTags action" }, 400);
      }
      const rows = await db.select().from(bookmarks).where(inArray(bookmarks.id, ids));
      for (const row of rows) {
        const existing = Array.isArray(row.tags) ? row.tags : [];
        const merged = Array.from(new Set([...existing, ...body.tags!]));
        await db.update(bookmarks).set({ tags: merged, updatedAt: now }).where(eq(bookmarks.id, row.id));
      }
      break;
    }
    default:
      return c.json({ error: `Unknown action: ${body.action}` }, 400);
  }

  return c.json({ success: true, affected: ids.length });
});

bookmarksRouter.post("/", async (c) => {
  const body = (await c.req.json()) as Partial<NewBookmark> & { url: string };

  if (!body.url?.trim()) {
    return c.json({ error: "URL is required" }, 400);
  }

  const url = normalizeUrl(body.url);

  const [existing] = await db
    .select()
    .from(bookmarks)
    .where(eq(bookmarks.url, url))
    .limit(1);

  if (existing) {
    return c.json(
      { error: "Bookmark already exists", bookmark: existing },
      409,
    );
  }

  const domain = new URL(url).hostname;
  const geminiReady = isGeminiConfigured();

  const [created] = await db
    .insert(bookmarks)
    .values({
      url,
      title: body.title ?? url,
      description: body.description ?? null,
      image: body.image ?? null,
      favicon: body.favicon ?? null,
      domain,
      tags: Array.isArray(body.tags) ? body.tags : [],
      source: "manual",
      summaryStatus: geminiReady ? "pending" : "skipped",
    })
    .returning();

  // Fire-and-forget: generate AI summary + auto-tags
  if (geminiReady && created) {
    const metaTitle = body.title ?? null;
    const metaDesc = body.description ?? null;

    generateSummary(url, metaTitle, metaDesc)
      .then(async (summary) => {
        if (summary) {
          await db
            .update(bookmarks)
            .set({ summary, summaryStatus: "complete", updatedAt: new Date() })
            .where(eq(bookmarks.id, created.id));
        } else {
          await db
            .update(bookmarks)
            .set({ summaryStatus: "failed", updatedAt: new Date() })
            .where(eq(bookmarks.id, created.id));
        }
      })
      .catch((err) => {
        logger.error("Summary generation error on create", {
          url,
          error: err instanceof Error ? err.message : String(err),
        });
      });

    // Auto-tag when no user-provided tags
    const userTags = Array.isArray(body.tags) ? body.tags : [];
    if (userTags.length === 0) {
      generateTags(url, metaTitle, metaDesc)
        .then(async (aiTags) => {
          if (aiTags.length > 0) {
            await db
              .update(bookmarks)
              .set({ tags: aiTags, updatedAt: new Date() })
              .where(eq(bookmarks.id, created.id));
          }
        })
        .catch((err) => {
          logger.error("Auto-tagging error on create", {
            url,
            error: err instanceof Error ? err.message : String(err),
          });
        });
    }
  }

  return c.json(created!, 201);
});

// --- Dynamic routes (/:id) ---

bookmarksRouter.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (Number.isNaN(id)) {
    return c.json({ error: "Invalid ID" }, 400);
  }
  const [bookmark] = await db
    .select()
    .from(bookmarks)
    .where(eq(bookmarks.id, id))
    .limit(1);
  if (!bookmark) {
    return c.json({ error: "Bookmark not found" }, 404);
  }
  return c.json(bookmark);
});

bookmarksRouter.patch("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (Number.isNaN(id)) {
    return c.json({ error: "Invalid ID" }, 400);
  }

  const body = (await c.req.json()) as Record<string, unknown>;
  const allowed = [
    "title",
    "description",
    "tags",

    "isArchived",
    "isRead",
  ];
  const updates: Partial<NewBookmark> = {};
  for (const key of allowed) {
    if (key in body) {
      (updates as Record<string, unknown>)[key] = body[key];
    }
  }
  updates.updatedAt = new Date();

  const [updated] = await db
    .update(bookmarks)
    .set(updates)
    .where(eq(bookmarks.id, id))
    .returning();

  if (!updated) {
    return c.json({ error: "Bookmark not found" }, 404);
  }
  return c.json(updated);
});

bookmarksRouter.post("/:id/refresh-metadata", async (c) => {
  const id = Number(c.req.param("id"));
  if (Number.isNaN(id)) {
    return c.json({ error: "Invalid ID" }, 400);
  }

  const [bookmark] = await db
    .select()
    .from(bookmarks)
    .where(eq(bookmarks.id, id))
    .limit(1);

  if (!bookmark) {
    return c.json({ error: "Bookmark not found" }, 404);
  }

  const metadata = await fetchMetadata(bookmark.url);
  const geminiReady = isGeminiConfigured();

  const [updated] = await db
    .update(bookmarks)
    .set({
      title: metadata.title ?? bookmark.title,
      description: metadata.description ?? bookmark.description,
      image: metadata.image ?? bookmark.image,
      favicon: metadata.favicon ?? bookmark.favicon,
      metadataStatus: metadata.success ? "complete" : "failed",
      summaryStatus: geminiReady ? "pending" : bookmark.summaryStatus,
      updatedAt: new Date(),
    })
    .where(eq(bookmarks.id, id))
    .returning();

  // Fire-and-forget: regenerate AI summary
  if (geminiReady && updated) {
    generateSummary(
      bookmark.url,
      metadata.title ?? bookmark.title,
      metadata.description ?? bookmark.description,
    )
      .then(async (summary) => {
        if (summary) {
          await db
            .update(bookmarks)
            .set({ summary, summaryStatus: "complete", updatedAt: new Date() })
            .where(eq(bookmarks.id, id));
        } else {
          await db
            .update(bookmarks)
            .set({ summaryStatus: "failed", updatedAt: new Date() })
            .where(eq(bookmarks.id, id));
        }
      })
      .catch((err) => {
        logger.error("Summary generation error on refresh", {
          url: bookmark.url,
          error: err instanceof Error ? err.message : String(err),
        });
      });
  }

  return c.json(updated);
});

bookmarksRouter.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (Number.isNaN(id)) {
    return c.json({ error: "Invalid ID" }, 400);
  }
  await db.delete(bookmarks).where(eq(bookmarks.id, id));
  return c.json({ success: true });
});
