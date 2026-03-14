import { bookmarks } from "@bookmark/db/schema/bookmarks";
import { db } from "@bookmark/db";
import { eq } from "drizzle-orm";
import { fetchMetadata } from "../metadata";
import { getCachedWaAllowedGroupJid } from "../settings";
import { logger } from "../../utils/logger";
import { extractURLs, extractHashtags, detectFavorite } from "../../utils/url-extractor";
import { env } from "@bookmark/env/server";
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  type WASocket,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import fs from "fs";
import pkg from "qrcode";
import { handleSearchCommand, handleReplyCommand, HELP_TEXT, extractQuestionQuery } from "./commands";

const { toDataURL } = pkg;

let sock: WASocket | null = null;
let qrCode: string | null = null;
let isConnected = false;
let phoneNumber: string | undefined;
let isReconnecting = false;
/** Last disconnect status code (e.g. 405) so API can show a hint when QR never appears. */
let lastDisconnectCode: number | undefined;

export type WhatsAppGroup = { jid: string; name: string };
let cachedGroups: WhatsAppGroup[] = [];

const AUTH_DIR = env.WA_AUTH_DIR ?? "./data/whatsapp_auth";

/** Env fallback when no setting in DB. Group JID e.g. 120363123456789012@g.us */
const ALLOWED_GROUP_JID_ENV = env.WA_ALLOWED_GROUP_JID?.trim();

function getAllowedGroupJid(): string | null {
  return getCachedWaAllowedGroupJid() ?? ALLOWED_GROUP_JID_ENV ?? null;
}

async function refreshGroupsCache(): Promise<void> {
  const s = sock;
  if (!s || typeof (s as any).groupFetchAllParticipating !== "function") return;
  try {
    const map = await (s as any).groupFetchAllParticipating();
    cachedGroups = Object.entries(map).map(([jid, meta]: [string, any]) => ({
      jid,
      name: meta?.subject ?? jid,
    }));
    logger.info("WhatsApp groups cached", { count: cachedGroups.length });
  } catch (e) {
    logger.warn("Failed to fetch WhatsApp groups", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

const RECONNECT_DELAY_MS = 5000;
const RECONNECT_DELAY_405_MS = 10000;

/** WhatsApp Web version [primary, secondary, tertiary]. Old versions get 405 from WA servers. */
type WAVersion = [number, number, number];

const WA_VERSION_URL =
  "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/versions.json";

/** Parse "2.3000.1031930579-alpha" to [2, 3000, 1031930579]. */
function parseVersionString(s: string): WAVersion | null {
  const match = s.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [
    parseInt(match[1], 10),
    parseInt(match[2], 10),
    parseInt(match[3], 10),
  ];
}

/** Fetch a current WA Web version to avoid 405 (outdated version rejected by WhatsApp). */
async function getLatestWaVersion(): Promise<WAVersion> {
  try {
    const res = await fetch(WA_VERSION_URL, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as {
      currentVersion?: string;
      versions?: Array<{ version: string; expire?: string }>;
    };
    if (data.currentVersion) {
      const v = parseVersionString(data.currentVersion);
      if (v) {
        logger.info("Using WA version from wa-version", {
          version: data.currentVersion,
        });
        return v;
      }
    }
    const list = data.versions ?? [];
    const now = new Date().toISOString();
    for (const entry of list) {
      if (entry.expire && entry.expire < now) continue;
      const v = parseVersionString(entry.version);
      if (v) return v;
    }
  } catch (e) {
    logger.warn("Could not fetch latest WA version, using fallback", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
  return [2, 3000, 1035112526];
}

async function reconnect(): Promise<void> {
  if (isReconnecting) return;
  isReconnecting = true;
  const previousSock = sock;
  sock = null;
  if (previousSock && typeof (previousSock as any).end === "function") {
    (previousSock as any).end(undefined);
  }
  isReconnecting = false;
  await initWhatsApp();
}

const REPLY_COMMANDS = ["delete", "archive", "fav", "favorite", "unfav"];

export async function initWhatsApp(): Promise<void> {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const version = await getLatestWaVersion();

  sock = makeWASocket({
    auth: state,
    version,
    printQRInTerminal: false,
  });

  const allowedJid = getAllowedGroupJid();
  if (allowedJid) {
    logger.info("WhatsApp: saving bookmarks only from group", {
      groupJid: allowedJid,
    });
  }

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr: qrData } = update;

    if (qrData) {
      try {
        qrCode = await toDataURL(qrData);
        logger.info("QR code generated");
      } catch (e) {
        logger.error("QR toDataURL failed", { error: e });
      }
    }

    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      lastDisconnectCode = statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;
      const isConnectionReplaced = statusCode === DisconnectReason.connectionReplaced;
      const shouldReconnect = !isLoggedOut && !isConnectionReplaced;

      if (isConnectionReplaced) {
        logger.warn(
          "WhatsApp connection replaced by another device/session — open Setup to link again",
          { statusCode },
        );
      } else {
        logger.warn("WhatsApp connection closed", {
          statusCode,
          shouldReconnect,
        });
      }

      if (isLoggedOut) {
        // Clear stale auth so a fresh QR is generated on next init
        try {
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          logger.info("Cleared stale WhatsApp auth directory");
        } catch (e) {
          logger.warn("Failed to clear auth directory", {
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      if (shouldReconnect || isLoggedOut) {
        const delayMs =
          statusCode === 405 ? RECONNECT_DELAY_405_MS : RECONNECT_DELAY_MS;
        setTimeout(() => reconnect(), delayMs);
      } else {
        isConnected = false;
        phoneNumber = undefined;
        qrCode = null;
      }
    } else if (connection === "open") {
      isConnected = true;
      qrCode = null;
      lastDisconnectCode = undefined;
      const id = (sock as any)?.user?.id;
      phoneNumber = id ? String(id).replace(/:.*/, "") : undefined;
      logger.info("WhatsApp connected", { phoneNumber });
      refreshGroupsCache();
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const msg of messages) {
      if (msg.key.fromMe) continue;

      const allowedJid = getAllowedGroupJid();
      if (allowedJid) {
        const chatJid = (msg.key.remoteJid ?? "").split(":")[0];
        if (chatJid !== allowedJid) continue;
      }

      const text =
        msg.message?.conversation ??
        (msg.message as any)?.extendedTextMessage?.text ??
        (msg.message as any)?.imageMessage?.caption ??
        "";

      if (!text) continue;

      const remoteJid = msg.key.remoteJid;

      // --- Search command ---
      const searchMatch = text.match(/^(?:\/)?search(?:\s+(.*))?$/i);
      if (searchMatch && remoteJid && sock) {
        await handleSearchCommand(sock, remoteJid, searchMatch[1] ?? "", msg);
        continue;
      }

      // --- Help command ---
      if (/^(?:\/)?help$/i.test(text.trim()) && remoteJid && sock) {
        await sock.sendMessage(remoteJid, { text: HELP_TEXT }, { quoted: msg });
        continue;
      }

      // --- Reply commands ---
      const quotedStanzaId = (msg.message as any)?.extendedTextMessage?.contextInfo?.stanzaId;
      if (quotedStanzaId) {
        const command = text.trim().toLowerCase();
        if (REPLY_COMMANDS.includes(command) && remoteJid && sock) {
          await handleReplyCommand(sock, remoteJid, command, quotedStanzaId, msg);
          continue;
        }
      }

      // --- Question query: messages starting with "?" ---
      if (remoteJid && sock) {
        const questionQuery = extractQuestionQuery(text);
        if (questionQuery) {
          await handleSearchCommand(sock, remoteJid, questionQuery, msg);
          continue;
        }
      }

      // --- URL extraction with hashtag tagging and !fav ---
      const urls = extractURLs(text);
      if (urls.length === 0) continue;

      const tags = extractHashtags(text);
      const isFavorite = detectFavorite(text);

      for (const url of urls) {
        try {
          logger.info("Processing URL from WhatsApp", {
            url,
            tags,
            isFavorite,
            chatJid: (remoteJid ?? "").split(":")[0],
          });

          const [existing] = await db
            .select({ id: bookmarks.id, title: bookmarks.title })
            .from(bookmarks)
            .where(eq(bookmarks.url, url))
            .limit(1);

          if (existing) {
            logger.info("Bookmark already exists", { url });
            if (remoteJid && sock) {
              await sock.sendMessage(
                remoteJid,
                { text: `⚠️ already saved` },
                { quoted: msg },
              );
            }
            continue;
          }

          const metadata = await fetchMetadata(url);

          await db.insert(bookmarks).values({
            url,
            title: metadata.title ?? url,
            description: metadata.description ?? null,
            image: metadata.image ?? null,
            favicon: metadata.favicon ?? null,
            domain: metadata.domain,
            tags: tags.length > 0 ? tags : [],
            isFavorite,
            source: "whatsapp",
            whatsappMessageId: msg.key.id,
            metadataStatus: metadata.success ? "complete" : "failed",
          });

          logger.info("Bookmark saved", { url, title: metadata.title, tags, isFavorite });

          const tagInfo = tags.length > 0 ? ` [${tags.join(", ")}]` : "";
          const favInfo = isFavorite ? " ⭐" : "";
          if (remoteJid && sock) {
            await sock.sendMessage(
              remoteJid,
              { text: `✅ saved${tagInfo}${favInfo}` },
              { quoted: msg },
            );
          }
        } catch (error) {
          logger.error("Failed to save bookmark", { url, error });

          if (remoteJid && sock) {
            await sock.sendMessage(
              remoteJid,
              { text: `❌ failed` },
              { quoted: msg },
            );
          }
        }
      }
    }
  });
}

export function getQRCode(): string | null {
  return qrCode;
}

export function getConnectionStatus(): {
  connected: boolean;
  phoneNumber?: string;
  lastDisconnectCode?: number;
} {
  return { connected: isConnected, phoneNumber, lastDisconnectCode };
}

export function getWhatsAppGroups(): WhatsAppGroup[] {
  return [...cachedGroups];
}

export async function refreshWhatsAppGroups(): Promise<WhatsAppGroup[]> {
  await refreshGroupsCache();
  return [...cachedGroups];
}

export async function disconnectWhatsApp(): Promise<void> {
  if (sock) {
    await sock.logout();
    sock = null;
    isConnected = false;
    phoneNumber = undefined;
    qrCode = null;
  }
  // Clear auth so next init generates a fresh QR
  try {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  } catch {}
}
