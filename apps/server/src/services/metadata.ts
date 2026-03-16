import * as cheerio from "cheerio";
import { getClient } from "./gemini-client";
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
  const domain = new URL(url).hostname;
  const favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

  // Try cheerio-based crawling first
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    logger.info("Metadata crawl response", { url, status: res.status, contentType: res.headers.get("content-type") });

    const contentType = res.headers.get("content-type") ?? "";
    // Non-2xx responses are likely error/block pages — skip parsing
    const isBlocked = res.status >= 400;

    if (contentType.includes("text/html")) {
      const html = await res.text();

      // If the response is blocked or very short HTML, skip cheerio entirely
      if (isBlocked || html.length < 500) {
        logger.info("Crawl returned block/minimal page, skipping cheerio", {
          url,
          status: res.status,
          htmlLength: html.length,
        });
      } else {
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

        let cleanTitle = title?.trim().slice(0, 500);

        if (cleanTitle && description) {
          const descTrimmed = description.trim();
          const idx = cleanTitle.indexOf(descTrimmed);
          if (idx !== -1) {
            cleanTitle = (cleanTitle.slice(0, idx) + cleanTitle.slice(idx + descTrimmed.length))
              .replace(/[\s:|\-–—]+$/, "")
              .replace(/^[\s:|\-–—]+/, "")
              .trim();
          }
        }

        // Detect junk titles from blocked/error pages that returned 200
        const hasUsefulTitle = cleanTitle && cleanTitle.length > 0 && !isJunkTitle(cleanTitle);
        const hasUsefulDesc = description && description.trim().length > 0 && !isJunkTitle(description.trim());

        logger.info("Crawled metadata extracted", {
          url,
          crawledTitle: cleanTitle ?? "(empty)",
          hasUsefulTitle,
          hasUsefulDesc,
          isJunk: cleanTitle ? isJunkTitle(cleanTitle) : false,
        });

        if (hasUsefulTitle || hasUsefulDesc) {
          return {
            title: hasUsefulTitle ? cleanTitle : undefined,
            description: hasUsefulDesc ? description?.trim().slice(0, 1000) : undefined,
            image: resolveUrl(image),
            favicon,
            domain,
            success: true,
          };
        }
      }
    } else {
      logger.info("Non-HTML response, skipping cheerio", { url, contentType });
    }
  } catch (error) {
    logger.warn("Crawl-based metadata fetch failed", {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Fallback: use Gemini to infer metadata from the URL itself
  logger.info("Falling through to AI metadata inference", { url });
  const aiMeta = await inferMetadataFromUrl(url);
  if (aiMeta) {
    logger.info("AI metadata inference succeeded", {
      url,
      title: aiMeta.title,
    });
    return {
      title: aiMeta.title,
      description: aiMeta.description,
      favicon,
      domain,
      success: true,
    };
  }

  logger.warn("All metadata methods failed", { url });
  return { domain, favicon, success: false };
}

/** Detect titles that come from error/block/captcha pages, not real content */
function isJunkTitle(title: string): boolean {
  const lower = title.toLowerCase().trim();
  // Empty or very short titles are junk
  if (lower.length < 2) return true;
  const junkPatterns = [
    "access denied",
    "403 forbidden",
    "404 not found",
    "page not found",
    "blocked",
    "just a moment",           // Cloudflare challenge
    "attention required",      // Cloudflare
    "security check",
    "are you a robot",
    "captcha",
    "please verify",
    "unauthorized",
    "forbidden",
    "not acceptable",
    "request rejected",
    "pardon our interruption", // common WAF page
    "checking your browser",
    "please wait",
    "one more step",
    "verify you are human",
    "robot or human",
    "enable javascript",
    "enable cookies",
  ];
  // Exact match "error" but not as substring (avoid matching "error handling guide")
  if (lower === "error") return true;
  return junkPatterns.some((p) => lower.includes(p));
}

interface AIMetadata {
  title: string;
  description: string;
}

const AI_METADATA_PROMPT = `You are analyzing a URL to generate metadata for a bookmark. The website blocked crawling, so you only have the URL. Analyze EVERYTHING in the URL: domain, path segments, category IDs, query parameters, filters, sort options, and any identifiers.

Return a JSON object with exactly these fields:
- "title": A concise, human-readable title for this bookmark (max 100 chars)
- "description": A 1-2 sentence description of what this link likely contains, including specifics you can extract from the URL (max 300 chars)

Be specific. Decode URL-encoded parameters. Examples:
- instagram.com/p/ABC123 → "Instagram Post"
- twitter.com/elonmusk/status/123 → "Post on X by @elonmusk"
- youtube.com/watch?v=xyz → "YouTube Video"
- nykaafashion.com/men/topwear/t-shirts/c/6825?f=sort%3Dbestseller%3Bcolor_filter%3D229 → "Nykaa Fashion — Men's T-Shirts (Bestsellers, filtered by color/size/price)"
- amazon.com/dp/B08N5WRWNW → "Amazon Product (B08N5WRWNW)"
- reddit.com/r/webdev/comments/... → "Reddit Post in r/webdev"

Extract as much context as possible from filters, categories, and path structure.
Return ONLY the JSON object, no other text.`;

async function inferMetadataFromUrl(url: string): Promise<AIMetadata | null> {
  const client = getClient();
  if (!client) {
    logger.warn("Gemini not configured, cannot infer metadata from URL", { url });
    return null;
  }

  try {
    logger.info("Calling Gemini for AI metadata inference", { url });
    const model = client.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    const result = await model.generateContent([
      AI_METADATA_PROMPT,
      `URL: ${url}`,
    ]);

    const text = result.response.text().trim();
    const cleaned = text
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();

    const parsed = JSON.parse(cleaned);
    if (typeof parsed.title !== "string" || typeof parsed.description !== "string") {
      logger.warn("AI metadata response had unexpected shape", { url, response: cleaned });
      return null;
    }

    return {
      title: parsed.title.slice(0, 500),
      description: parsed.description.slice(0, 1000),
    };
  } catch (error) {
    logger.warn("AI metadata inference failed", {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
