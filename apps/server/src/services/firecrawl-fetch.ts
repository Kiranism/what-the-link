import Firecrawl from "@mendable/firecrawl-js";
import { env } from "@bookmark/env/server";
import { logger } from "../utils/logger";

export interface FirecrawlMetadata {
  title?: string;
  description?: string;
  image?: string;
  /** Compacted markdown (image markdown + boilerplate stripped, capped) for LLM context. */
  markdown?: string;
}

const MAX_BODY_CHARS = 5000;

/**
 * Strip noise from Firecrawl markdown (image markdown, horizontal rules, repeated
 * whitespace) and truncate to keep token costs sane when feeding into the LLM.
 */
export function compactMarkdown(md: string, maxChars: number = MAX_BODY_CHARS): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, "")
    .replace(/^[ \t]*\*\s*\*\s*\*[ \t]*$/gm, "")
    .replace(/^[ \t]*---[ \t]*$/gm, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxChars);
}

let client: Firecrawl | null = null;

function getClient(): Firecrawl | null {
  if (!env.FIRECRAWL_API_KEY) return null;
  if (!client) client = new Firecrawl({ apiKey: env.FIRECRAWL_API_KEY });
  return client;
}

export function isFirecrawlConfigured(): boolean {
  return !!env.FIRECRAWL_API_KEY;
}

/**
 * Fetch metadata for a URL via Firecrawl. Returns null when the key is unset
 * or the scrape fails — caller falls back to cheerio.
 */
export async function fetchMetadataWithFirecrawl(
  url: string,
): Promise<FirecrawlMetadata | null> {
  const fc = getClient();
  if (!fc) return null;

  try {
    logger.info("Firecrawl scrape start", { url });
    const doc = await fc.scrape(url, {
      formats: ["markdown"],
      onlyMainContent: true,
      timeout: 25_000,
    });

    const meta = doc.metadata ?? {};
    const title = pick(meta.ogTitle, meta.title);
    const description = pick(meta.ogDescription, meta.description);
    const image = pick(meta.ogImage);
    const body = doc.markdown ? compactMarkdown(doc.markdown) : undefined;

    logger.info("Firecrawl scrape ok", {
      url,
      hasTitle: !!title,
      hasDescription: !!description,
      hasImage: !!image,
      bodyChars: body?.length ?? 0,
    });

    return {
      title: title?.trim().slice(0, 500),
      description: description?.trim().slice(0, 1000),
      image: image?.trim(),
      markdown: body,
    };
  } catch (error) {
    logger.warn("Firecrawl scrape failed", {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function pick(...vals: Array<string | undefined>): string | undefined {
  for (const v of vals) {
    if (typeof v === "string" && v.trim().length > 0) return v;
  }
  return undefined;
}
