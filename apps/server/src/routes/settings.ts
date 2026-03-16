import { Hono } from "hono";
import { getWhatsAppGroups, refreshWhatsAppGroups } from "../services/whatsapp";
import { getAppSettings, setWaAllowedGroupJid, setDigestEnabled, setDigestHour } from "../services/settings";

export const settingsRouter = new Hono();

settingsRouter.get("/", async (c) => {
  const settings = await getAppSettings();
  return c.json(settings);
});

settingsRouter.patch("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const waAllowedGroupJid =
    typeof body.waAllowedGroupJid === "string"
      ? body.waAllowedGroupJid
      : body.waAllowedGroupJid === null
        ? null
        : undefined;

  if (waAllowedGroupJid !== undefined) {
    await setWaAllowedGroupJid(waAllowedGroupJid);
  }

  if (typeof body.digestEnabled === "boolean") {
    await setDigestEnabled(body.digestEnabled);
  }

  if (typeof body.digestHour === "number") {
    await setDigestHour(body.digestHour);
  }

  const settings = await getAppSettings();
  return c.json(settings);
});

settingsRouter.get("/whatsapp-groups", (c) => {
  const groups = getWhatsAppGroups();
  return c.json({ groups });
});

settingsRouter.post("/whatsapp-groups/refresh", async (c) => {
  const groups = await refreshWhatsAppGroups();
  return c.json({ groups });
});
