import * as cheerio from "cheerio";
import { logger } from "../utils/logger";

export interface Metadata {
  title?: string;
  description?: string;
  image?: string;
  favicon?: string;
  domain: string;
  success: boolean;
}

export async function fetchMetadata(url: string): Promise<Metadata> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      logger.warn("Non-HTML content", { url, contentType });
      return { domain: new URL(url).hostname, success: false };
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    const title =
      $('meta[property="og:title"]').attr("content") ??
      $('meta[name="twitter:title"]').attr("content") ??
      $("title").text() ??
      undefined;

    const description =
      $('meta[property="og:description"]').attr("content") ??
      $('meta[name="twitter:description"]').attr("content") ??
      $('meta[name="description"]').attr("content") ??
      undefined;

    const image =
      $('meta[property="og:image"]').attr("content") ??
      $('meta[name="twitter:image"]').attr("content") ??
      undefined;

    const resolveUrl = (relative?: string) => {
      if (!relative) return undefined;
      try {
        return new URL(relative, url).href;
      } catch {
        return relative;
      }
    };

    const domain = new URL(url).hostname;
    const favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

    let cleanTitle = title?.trim().slice(0, 500);

    // If the title contains the description (common on GitHub, etc.),
    // strip the description portion to keep the title short.
    if (cleanTitle && description) {
      const descTrimmed = description.trim();
      const idx = cleanTitle.indexOf(descTrimmed);
      if (idx !== -1) {
        // Remove the description and any leading separator like ": " or " - "
        cleanTitle = (cleanTitle.slice(0, idx) + cleanTitle.slice(idx + descTrimmed.length))
          .replace(/[\s:|\-–—]+$/, "")
          .replace(/^[\s:|\-–—]+/, "")
          .trim();
      }
    }

    return {
      title: cleanTitle || undefined,
      description: description?.trim().slice(0, 1000),
      image: resolveUrl(image),
      favicon,
      domain,
      success: true,
    };
  } catch (error) {
    logger.error("Failed to fetch metadata", { url, error });
    return { domain: new URL(url).hostname, success: false };
  }
}
