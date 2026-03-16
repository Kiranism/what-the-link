import { getAIClient, isAIConfigured, getChatModel } from "./ai-client";
import { logger } from "../utils/logger";

export { isAIConfigured };

const TAGGING_PROMPT = `Given the following bookmark information, suggest 2-4 short, lowercase tags that categorize this content. Tags should be single words or short hyphenated phrases (e.g. "design", "web-dev", "cooking", "finance", "news", "social-media", "video", "shopping").

If title and description are missing (the site blocked crawling), analyze the URL structure — domain, path, query parameters — to infer appropriate tags. For example:
- instagram.com → "instagram", "social-media"
- youtube.com/watch → "youtube", "video"
- amazon.com/dp/... → "shopping", "amazon"

Return ONLY a JSON array of tag strings, no other text.`;

/**
 * Generate AI tags for a bookmark.
 * Returns empty array if AI is not configured or on error.
 */
export async function generateTags(
  url: string,
  title: string | null,
  description: string | null,
): Promise<string[]> {
  const client = getAIClient();
  if (!client) {
    logger.warn("AI not configured, skipping tag generation", { url });
    return [];
  }

  try {
    logger.info("Generating AI tags", { url, hasTitle: !!title, hasDescription: !!description });

    const context = [
      `URL: ${url}`,
      title ? `Title: ${title}` : null,
      description ? `Description: ${description}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const result = await client.chat.completions.create({
      model: getChatModel(),
      messages: [
        { role: "system", content: TAGGING_PROMPT },
        { role: "user", content: context },
      ],
    });

    const text = result.choices[0]?.message?.content?.trim();
    if (!text) return [];

    const cleaned = text
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();

    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];

    const tags = parsed
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.trim().toLowerCase().slice(0, 50))
      .filter((t) => t.length > 0)
      .slice(0, 5);

    logger.info("AI tags generated successfully", { url, tags });
    return tags;
  } catch (error) {
    logger.error("AI tag generation failed", {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}
