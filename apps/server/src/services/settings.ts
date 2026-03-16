import { db, dbClient } from "@bookmark/db";
import { appSettings } from "@bookmark/db/schema/settings";
import { eq } from "drizzle-orm";

const KEY_WA_ALLOWED_GROUP_JID = "wa_allowed_group_jid";
const KEY_DIGEST_ENABLED = "digest_enabled";
const KEY_DIGEST_HOUR = "digest_hour";

let cache: {
  waAllowedGroupJid: string | null;
  digestEnabled: boolean;
  digestHour: number;
} = { waAllowedGroupJid: null, digestEnabled: true, digestHour: 20 };

export async function ensureAppSettingsTable(): Promise<void> {
  await dbClient.execute(
    "CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT)",
  );
}

export async function getAppSettings(): Promise<{
  waAllowedGroupJid: string | null;
  digestEnabled: boolean;
  digestHour: number;
}> {
  const rows = await db
    .select({ key: appSettings.key, value: appSettings.value })
    .from(appSettings);

  const map = new Map(rows.map((r) => [r.key, r.value]));

  const waAllowedGroupJid = map.get(KEY_WA_ALLOWED_GROUP_JID)?.trim() || null;
  const digestEnabled = map.get(KEY_DIGEST_ENABLED) !== "false";
  const digestHour = Number(map.get(KEY_DIGEST_HOUR)) || 20;

  cache = { waAllowedGroupJid, digestEnabled, digestHour };
  return cache;
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

export async function setDigestEnabled(enabled: boolean): Promise<void> {
  const v = String(enabled);
  await db
    .insert(appSettings)
    .values({ key: KEY_DIGEST_ENABLED, value: v })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: v } });
  cache.digestEnabled = enabled;
}

export async function setDigestHour(hour: number): Promise<void> {
  const h = Math.max(0, Math.min(23, Math.round(hour)));
  const v = String(h);
  await db
    .insert(appSettings)
    .values({ key: KEY_DIGEST_HOUR, value: v })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: v } });
  cache.digestHour = h;
}

/** Cached allowed group JID for WhatsApp filter (env override still applied in whatsapp.ts). */
export function getCachedWaAllowedGroupJid(): string | null {
  return cache.waAllowedGroupJid ?? null;
}

export function getCachedDigestEnabled(): boolean {
  return cache.digestEnabled;
}

export function getCachedDigestHour(): number {
  return cache.digestHour;
}
