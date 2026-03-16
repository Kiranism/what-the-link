import { getAIClient, isAIConfigured, getChatModel } from "./ai-client";
import { logger } from "../utils/logger";

export { isAIConfigured };

const LINK_EXTRACTION_PROMPT = `Extract all URLs/links from the provided content. Return ONLY a JSON array of URL strings. Rules:
- Include full URLs (with https:// prefix if missing in the original)
- Include partial URLs like "example.com/path" — prepend "https://"
- Ignore email addresses
- If no URLs are found, return an empty array []
- Return ONLY the JSON array, no other text`;

/**
 * Extract URLs from text using AI when regex-based extraction fails.
 * Useful for obfuscated, partial, or unusually formatted URLs.
 */
export async function extractLinksFromText(text: string): Promise<string[]> {
  const client = getAIClient();
  if (!client) return [];

  try {
    const result = await client.chat.completions.create({
      model: getChatModel(),
      messages: [
        { role: "system", content: LINK_EXTRACTION_PROMPT },
        { role: "user", content: `Text:\n${text}` },
      ],
    });

    const responseText = result.choices[0]?.message?.content ?? "";
    return parseUrlResponse(responseText);
  } catch (error) {
    logger.error("AI text link extraction failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Extract URLs from an image using AI vision capabilities.
 * Handles screenshots, photos of screens, printed URLs, QR codes with URLs, etc.
 */
export async function extractLinksFromImage(
  imageBuffer: Buffer,
  mimeType: string = "image/jpeg",
): Promise<string[]> {
  const client = getAIClient();
  if (!client) return [];

  try {
    const base64 = imageBuffer.toString("base64");
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const result = await client.chat.completions.create({
      model: getChatModel(),
      messages: [
        { role: "system", content: LINK_EXTRACTION_PROMPT },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    });

    const responseText = result.choices[0]?.message?.content ?? "";
    return parseUrlResponse(responseText);
  } catch (error) {
    logger.error("AI image link extraction failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

function parseUrlResponse(responseText: string): string[] {
  try {
    const cleaned = responseText
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is string => typeof item === "string")
      .map((url) => {
        const trimmed = url.trim();
        if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
          return `https://${trimmed}`;
        }
        return trimmed;
      })
      .filter((url) => {
        try {
          new URL(url);
          return true;
        } catch {
          return false;
        }
      });
  } catch {
    logger.warn("Failed to parse AI link extraction response", {
      responseText,
    });
    return [];
  }
}
