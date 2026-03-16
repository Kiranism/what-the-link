import { getAIClient, isAIConfigured, getChatModel } from "./ai-client";
import { logger } from "../utils/logger";

export { isAIConfigured };

const SUMMARY_PROMPT = `Summarize in 4-5 concise lines what the page is about and why it's useful. Return ONLY the summary text, no markdown formatting, no bullet points.

If title and description are missing (the site blocked crawling), analyze the URL structure — domain, path, query parameters, usernames, IDs — to infer what the content is about. Be specific: mention the platform, content type, and any identifiable details from the URL.`;

const MAX_SUMMARY_LENGTH = 2000;

/**
 * Generate an AI summary for a bookmark.
 * Returns null if AI is not configured or on error.
 */
export async function generateSummary(
  url: string,
  title: string | null,
  description: string | null,
): Promise<string | null> {
  const client = getAIClient();
  if (!client) {
    logger.warn("AI not configured, skipping summary generation", { url });
    return null;
  }

  try {
    logger.info("Generating AI summary", { url, hasTitle: !!title, hasDescription: !!description });

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
        { role: "system", content: SUMMARY_PROMPT },
        { role: "user", content: context },
      ],
    });

    const text = result.choices[0]?.message?.content?.trim();
    if (!text) {
      logger.warn("AI returned empty summary", { url });
      return null;
    }

    logger.info("AI summary generated successfully", { url, length: text.length });
    return text.slice(0, MAX_SUMMARY_LENGTH);
  } catch (error) {
    logger.error("AI summary generation failed", {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
