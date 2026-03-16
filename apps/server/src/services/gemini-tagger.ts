import { getClient, isGeminiConfigured } from "./gemini-client";
import { logger } from "../utils/logger";

export { isGeminiConfigured };

const TAGGING_PROMPT = `Given the following bookmark information, suggest 2-4 short, lowercase tags that categorize this content. Tags should be single words or short hyphenated phrases (e.g. "design", "web-dev", "cooking", "finance", "news", "social-media", "video", "shopping").

If title and description are missing (the site blocked crawling), analyze the URL structure — domain, path, query parameters — to infer appropriate tags. For example:
- instagram.com → "instagram", "social-media"
- youtube.com/watch → "youtube", "video"
- amazon.com/dp/... → "shopping", "amazon"

Return ONLY a JSON array of tag strings, no other text.`;

/**
 * Generate AI tags for a bookmark using Gemini.
 * Returns empty array if Gemini is not configured or on error.
 */
export async function generateTags(
  url: string,
  title: string | null,
  description: string | null,
): Promise<string[]> {
  const client = getClient();
  if (!client) return [];

  try {
    const model = client.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    const context = [
      `URL: ${url}`,
      title ? `Title: ${title}` : null,
      description ? `Description: ${description}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const result = await model.generateContent([
      TAGGING_PROMPT,
      context,
    ]);

    const text = result.response.text().trim();
    if (!text) return [];

    const cleaned = text
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();

    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.trim().toLowerCase().slice(0, 50))
      .filter((t) => t.length > 0)
      .slice(0, 5);
  } catch (error) {
    logger.error("Gemini tag generation failed", {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}
