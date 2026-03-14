import { db, dbClient } from "@bookmark/db";
import { appSettings } from "@bookmark/db/schema/settings";
import { eq } from "drizzle-orm";

const KEY_WA_ALLOWED_GROUP_JID = "wa_allowed_group_jid";

let cache: { waAllowedGroupJid: string | null } = { waAllowedGroupJid: null };

export async function ensureAppSettingsTable(): Promise<void> {
  await dbClient.execute(
    "CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT)",
  );
}

export async function getAppSettings(): Promise<{
  waAllowedGroupJid: string | null;
}> {
  const row = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, KEY_WA_ALLOWED_GROUP_JID))
    .limit(1)
    .then((rows) => rows[0]);

  const waAllowedGroupJid = row?.value?.trim() || null;
  cache.waAllowedGroupJid = waAllowedGroupJid;
  return { waAllowedGroupJid };
}

export async function setWaAllowedGroupJid(value: string | null): Promise<void> {
  const v = value?.trim() || null;
  if (v) {
    await db
      .insert(appSettings)
      .values({ key: KEY_WA_ALLOWED_GROUP_JID, value: v })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: v },
      });
  } else {
    await db
      .delete(appSettings)
      .where(eq(appSettings.key, KEY_WA_ALLOWED_GROUP_JID));
  }
  cache.waAllowedGroupJid = v;
}

/** Cached allowed group JID for WhatsApp filter (env override still applied in whatsapp.ts). */
export function getCachedWaAllowedGroupJid(): string | null {
  return cache.waAllowedGroupJid ?? null;
}
