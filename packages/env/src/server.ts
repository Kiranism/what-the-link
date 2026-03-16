import dotenv from "dotenv";
import path from "path";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

// Load root .env when running from apps/server so DATABASE_URL is found
const cwd = process.cwd();
if (cwd.endsWith("server") || cwd.includes("apps/server")) {
  dotenv.config({ path: path.join(cwd, "../../.env") });
}
dotenv.config(); // cwd .env overrides

const DEFAULT_DATABASE_URL =
  process.env.NODE_ENV === "production"
    ? "file:/data/bookmarks.db"
    : "file:./data/bookmarks.db";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    CORS_ORIGIN: z.url().optional(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    APP_PASSWORD: z.string().min(1),
    WA_AUTH_DIR: z.string().optional(),
    /** When set, only save bookmarks from this WhatsApp group (use group JID, e.g. 120363123456789012@g.us). Leave unset to allow all chats. */
    WA_ALLOWED_GROUP_JID: z.string().optional(),
    /** Google Gemini API key for AI-powered link extraction from text and images. */
    GEMINI_API_KEY: z.string().optional(),
  },
  runtimeEnv: {
    ...process.env,
    DATABASE_URL:
      process.env.DATABASE_URL ??
      (process.env.NODE_ENV !== "production" ? DEFAULT_DATABASE_URL : undefined),
  },
  emptyStringAsUndefined: true,
});
