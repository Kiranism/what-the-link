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

export interface BookmarkClassification {
  tags: string[];
  collection: "shopping" | null;
  category: ShopCategory | null;
}

const SYSTEM_PROMPT = `You are classifying a saved bookmark. Decide three things from URL + title + description + page content (if provided):

1. tags: 2-4 short lowercase tags (single words or hyphenated, e.g. "design", "web-dev", "news", "video").
2. collection: "shopping" ONLY if the page is a product that a person could buy — listing page, product detail page, store category, or marketplace item. Editorial articles, reviews, blog posts about products, and brand storefronts without buy-now affordances should be null. When unsure, return null.
3. category: when collection is "shopping", pick ONE from: ${SHOP_CATEGORIES.join(", ")}. Otherwise null.
   - Wristwatch / smartwatch → "watches"
   - Headphones, earbuds, phones, laptops, TVs → "electronics"
   - Skincare, makeup, fragrance, haircare → "beauty"
   - Apparel (shirts, dresses, jeans, ethnic wear) → "clothing"
   - Bags, belts, wallets, jewelry, sunglasses → "accessories"
   - Sneakers, sandals, formal shoes, boots → "shoes"
   - Furniture, decor, bedding → "home"
   - Cookware, appliances, dinnerware → "kitchen"
   - Anything that fits "shopping" but no specific bucket → "other"

Return ONLY a JSON object with this exact shape, no other text:
{"tags": ["..."], "collection": "shopping" | null, "category": "watches" | null}`;

const MAX_TAGS = 5;
const MAX_TAG_LEN = 50;

/**
 * Single-call classifier that returns tags, collection and category in one
 * AI round-trip. Pass `body` (Firecrawl-compacted markdown) when available —
 * page content lets the model recognize indie e-commerce sites it can't
 * identify from the domain alone.
 *
 * Returns null on AI failure or when AI is not configured. The caller should
 * treat that as "leave tags/collection untouched" rather than empty.
 */
export async function classifyBookmark(input: {
  url: string;
  title: string | null;
  description: string | null;
  body?: string | null;
}): Promise<BookmarkClassification | null> {
  const client = getAIClient();
  if (!client) {
    logger.warn("AI not configured, skipping bookmark classification", { url: input.url });
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
    logger.info("Classifying bookmark", {
      url: input.url,
      hasTitle: !!input.title,
      hasDescription: !!input.description,
      bodyChars: input.body?.length ?? 0,
    });

    const result = await client.chat.completions.create({
      model: getChatModel(),
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: context },
      ],
    });

    const text = result.choices[0]?.message?.content?.trim() ?? "";
    const cleaned = text
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();

    const parsed = JSON.parse(cleaned) as unknown;
    if (!parsed || typeof parsed !== "object") {
      logger.warn("Bookmark classifier returned non-object", { url: input.url, response: cleaned });
      return null;
    }

    const obj = parsed as Record<string, unknown>;

    const tags = Array.isArray(obj.tags)
      ? obj.tags
          .filter((t): t is string => typeof t === "string")
          .map((t) => t.trim().toLowerCase().slice(0, MAX_TAG_LEN))
          .filter((t) => t.length > 0)
          .slice(0, MAX_TAGS)
      : [];

    const collection = obj.collection === "shopping" ? "shopping" : null;

    let category: ShopCategory | null = null;
    if (collection === "shopping" && typeof obj.category === "string") {
      const c = obj.category.trim().toLowerCase().replace(/[^a-z]/g, "");
      if ((SHOP_CATEGORIES as readonly string[]).includes(c)) {
        category = c as ShopCategory;
      } else {
        category = "other";
      }
    }

    logger.info("Bookmark classified", {
      url: input.url,
      tags,
      collection,
      category,
    });

    return { tags, collection, category };
  } catch (error) {
    logger.warn("Bookmark classification failed", {
      url: input.url,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
