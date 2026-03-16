import {
  index,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const bookmarks = sqliteTable(
  "bookmarks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    url: text("url").notNull().unique(),
    title: text("title"),
    description: text("description"),
    image: text("image"),
    favicon: text("favicon"),
    domain: text("domain").notNull(),
    tags: text("tags", { mode: "json" })
      .$type<string[]>()
      .default(sql`'[]'`),
    isArchived: integer("is_archived", { mode: "boolean" })
      .notNull()
      .default(false),

    isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    source: text("source").notNull().default("whatsapp"),
    whatsappMessageId: text("whatsapp_message_id"),
    metadataStatus: text("metadata_status").notNull().default("complete"),
    metadataRetries: integer("metadata_retries").notNull().default(0),
    summary: text("summary"),
    summaryStatus: text("summary_status").notNull().default("skipped"),
    summaryRetries: integer("summary_retries").notNull().default(0),
  },
  (table) => ({
    createdAtIdx: index("idx_bookmarks_created_at").on(table.createdAt),
    domainIdx: index("idx_bookmarks_domain").on(table.domain),

    archivedIdx: index("idx_bookmarks_archived").on(table.isArchived),
  }),
);

export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  count: integer("count").notNull().default(1),
  lastUsed: integer("last_used", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export type Bookmark = typeof bookmarks.$inferSelect;
export type NewBookmark = typeof bookmarks.$inferInsert;
export type Tag = typeof tags.$inferSelect;
