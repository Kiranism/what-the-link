import { env } from "@bookmark/env/server";
import { createClient } from "@libsql/client/node";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import * as schema from "./schema";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Repo root when this package is at packages/db */
const REPO_ROOT = path.resolve(__dirname, "../../..");

function resolveDatabaseUrl(url: string): string {
  if (!url.startsWith("file:")) return url;
  const rawPath = url.slice(5);
  // Absolute path (e.g. file:/data/bookmarks.db) — use as-is
  if (rawPath.startsWith("/")) return url;
  // Relative path (e.g. file:./data/bookmarks.db) — resolve from repo root
  const absolutePath = path.join(REPO_ROOT, path.normalize(rawPath));
  return `file:${absolutePath}`;
}

const databaseUrl = resolveDatabaseUrl(env.DATABASE_URL);
if (databaseUrl.startsWith("file:")) {
  const dbPath = databaseUrl.slice(5).replace(/^\/+/, "");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}
const client = createClient({ url: databaseUrl });

export const db = drizzle({ client, schema });
export { client as dbClient };

export async function runMigrations(): Promise<void> {
  if (databaseUrl.startsWith("file:")) {
    const dbPath = databaseUrl.slice(5).replace(/^\/+/, "");
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const migrationsFolder = path.join(__dirname, "migrations");
  fs.mkdirSync(migrationsFolder, { recursive: true });
  await migrate(db, { migrationsFolder });
}
