import fs from "fs";
import path from "path";
import { defineConfig } from "drizzle-kit";
import dotenv from "dotenv";

// Load root .env first, then apps/server/.env so drizzle-kit sees same DATABASE_URL as server
dotenv.config({ path: path.join(process.cwd(), "../../.env") });
dotenv.config({ path: path.join(process.cwd(), "../../apps/server/.env") });

const rawUrl = process.env.DATABASE_URL || "";
function resolveDatabaseUrl(url: string): string {
  if (!url.startsWith("file:")) return url;
  const urlPath = url.slice(5).replace(/^\/+/, "");
  if (path.isAbsolute(urlPath)) return url;
  // drizzle.config runs from packages/db, so repo root is ../..
  const repoRoot = path.resolve(process.cwd(), "../..");
  return `file:${path.join(repoRoot, path.normalize(urlPath))}`;
}

const resolvedUrl = resolveDatabaseUrl(rawUrl);
if (resolvedUrl.startsWith("file:")) {
  const dbPath = resolvedUrl.slice(5).replace(/^\/+/, "");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

export default defineConfig({
  schema: "./src/schema",
  out: "./src/migrations",
  dialect: "turso",
  dbCredentials: {
    url: resolvedUrl,
  },
});
