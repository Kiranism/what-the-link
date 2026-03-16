import { getClient, isGeminiConfigured } from "./gemini-client";
import { logger } from "../utils/logger";

export { isGeminiConfigured };

const LINK_EXTRACTION_PROMPT = `Extract all URLs/links from the provided content. Return ONLY a JSON array of URL strings. Rules:
- Include full URLs (with https:// prefix if missing in the original)
- Include partial URLs like "example.com/path" — prepend "https://"
- Ignore email addresses
- If no URLs are found, return an empty array []
- Return ONLY the JSON array, no other text`;

/**
 * Extract URLs from text using Gemini when regex-based extraction fails.
 * Useful for obfuscated, partial, or unusually formatted URLs.
 */
export async function extractLinksFromText(text: string): Promise<string[]> {
  const client = getClient();
  if (!client) return [];

  try {
    const model = client.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    const result = await model.generateContent([
      LINK_EXTRACTION_PROMPT,
      `Text:\n${text}`,
    ]);
    return parseUrlResponse(result.response.text());
  } catch (error) {
    logger.error("Gemini text link extraction failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Extract URLs from an image using Gemini's vision capabilities.
 * Handles screenshots, photos of screens, printed URLs, QR codes with URLs, etc.
 */
export async function extractLinksFromImage(
  imageBuffer: Buffer,
  mimeType: string = "image/jpeg",
): Promise<string[]> {
  const client = getClient();
  if (!client) return [];

  try {
    const model = client.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    const imagePart = {
      inlineData: {
        data: imageBuffer.toString("base64"),
        mimeType,
      },
    };
    const result = await model.generateContent([
      LINK_EXTRACTION_PROMPT,
      imagePart,
    ]);
    return parseUrlResponse(result.response.text());
  } catch (error) {
    logger.error("Gemini image link extraction failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

function parseUrlResponse(responseText: string): string[] {
  try {
    // Strip markdown code fences if present
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
    logger.warn("Failed to parse Gemini link extraction response", {
      responseText,
    });
    return [];
  }
}
