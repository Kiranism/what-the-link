import { getAIClient, getChatModel } from "./ai-client";
import { logger } from "../utils/logger";

export const SHOP_CATEGORIES = [
  "watches",
  "shoes",
  "clothing",
  "accessories",
  "electronics",
  "beauty",
  "home",
  "kitchen",
  "books",
  "food",
  "sports",
  "toys",
  "other",
] as const;

export type ShopCategory = (typeof SHOP_CATEGORIES)[number];

const CLASSIFIER_PROMPT = `You are categorizing a shopping product link. Pick exactly ONE category from this list that best fits the product:

${SHOP_CATEGORIES.join(", ")}

Rules:
- Reply with ONLY the category word, lowercase, no punctuation, no explanation.
- If the URL or text mentions a wristwatch / smartwatch → "watches".
- Headphones / earbuds / phones / laptops → "electronics".
- Skincare, makeup, fragrance, haircare → "beauty".
- Apparel (shirts, dresses, jeans, ethnic wear) → "clothing".
- Bags, belts, wallets, jewelry, sunglasses → "accessories".
- Sneakers, sandals, formal shoes, boots → "shoes".
- Furniture, decor, bedding → "home".
- Cookware, appliances, dinnerware → "kitchen".
- Anything that does not fit → "other".`;

/**
 * Classify a shopping URL into one of SHOP_CATEGORIES. Returns null when AI
 * isn't configured or the call fails — caller can default to "other".
 */
export async function classifyShoppingCategory(input: {
  url: string;
  title: string | null;
  description: string | null;
  body?: string | null;
}): Promise<ShopCategory | null> {
  const client = getAIClient();
  if (!client) {
    logger.warn("AI not configured, skipping shop classification", { url: input.url });
    return null;
  }

  const context = [
    `URL: ${input.url}`,
    input.title ? `Title: ${input.title}` : null,
    input.description ? `Description: ${input.description}` : null,
    input.body ? `Page content (compacted):\n${input.body}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const result = await client.chat.completions.create({
      model: getChatModel(),
      messages: [
        { role: "system", content: CLASSIFIER_PROMPT },
        { role: "user", content: context },
      ],
    });

    const raw = result.choices[0]?.message?.content?.trim().toLowerCase() ?? "";
    const cleaned = raw.replace(/[^a-z]/g, "");

    if ((SHOP_CATEGORIES as readonly string[]).includes(cleaned)) {
      logger.info("Shop classification", { url: input.url, category: cleaned });
      return cleaned as ShopCategory;
    }

    logger.warn("Shop classifier returned unknown category", {
      url: input.url,
      raw,
    });
    return null;
  } catch (error) {
    logger.warn("Shop classification failed", {
      url: input.url,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
