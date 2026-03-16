import { getClient, isGeminiConfigured } from "./gemini-client";
import { logger } from "../utils/logger";

export { isGeminiConfigured };

const SUMMARY_PROMPT = `Summarize in 4-5 concise lines what the page is about and why it's useful. Return ONLY the summary text, no markdown formatting, no bullet points.

If title and description are missing (the site blocked crawling), analyze the URL structure — domain, path, query parameters, usernames, IDs — to infer what the content is about. Be specific: mention the platform, content type, and any identifiable details from the URL.`;

const MAX_SUMMARY_LENGTH = 2000;

/**
 * Generate an AI summary for a bookmark using Gemini.
 * Returns null if Gemini is not configured or on error.
 */
export async function generateSummary(
  url: string,
  title: string | null,
  description: string | null,
): Promise<string | null> {
  const client = getClient();
  if (!client) {
    logger.warn("Gemini not configured, skipping summary generation", { url });
    return null;
  }

  try {
    logger.info("Generating AI summary", { url, hasTitle: !!title, hasDescription: !!description });
    const model = client.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    const context = [
      `URL: ${url}`,
      title ? `Title: ${title}` : null,
      description ? `Description: ${description}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const result = await model.generateContent([
      SUMMARY_PROMPT,
      context,
    ]);

    const text = result.response.text().trim();
    if (!text) {
      logger.warn("Gemini returned empty summary", { url });
      return null;
    }

    logger.info("AI summary generated successfully", { url, length: text.length });
    return text.slice(0, MAX_SUMMARY_LENGTH);
  } catch (error) {
    logger.error("Gemini summary generation failed", {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
