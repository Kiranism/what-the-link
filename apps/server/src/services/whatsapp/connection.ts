import { bookmarks } from "@bookmark/db/schema/bookmarks";
import { db } from "@bookmark/db";
import { eq } from "drizzle-orm";
import { fetchMetadata } from "../metadata";
import { getCachedWaAllowedGroupJid } from "../settings";
import { logger } from "../../utils/logger";
import { extractURLs, extractHashtags } from "../../utils/url-extractor";
import {
  extractLinksFromText,
  extractLinksFromImage,
  isAIConfigured,
} from "../gemini-link-extractor";
import { generateSummary } from "../gemini-summarizer";
import { generateTags } from "../gemini-tagger";
import { env } from "@bookmark/env/server";
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
  type WASocket,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import fs from "fs";
import pkg from "qrcode";
import { handleSearchCommand, extractQuestionQuery, extractHelpCommand, handleHelpCommand } from "./commands";

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

      const remoteJid = msg.key.remoteJid;
      const hasImage = !!(msg.message as any)?.imageMessage;

      // --- Help command ---
      if (text && remoteJid && sock && extractHelpCommand(text)) {
        await handleHelpCommand(sock, remoteJid, msg);
        continue;
      }

      // --- Question query: messages starting with "?" ---
      if (text && remoteJid && sock) {
        const questionQuery = extractQuestionQuery(text);
        if (questionQuery) {
          await handleSearchCommand(sock, remoteJid, questionQuery, msg);
          continue;
        }
      }

      // --- Collect URLs from all sources ---
      let urls: string[] = [];
      let tags: string[] = [];
      let source: "regex" | "ai-text" | "ai-image" = "regex";

      // 1. Try regex extraction from text first (fast, free)
      if (text) {
        urls = extractURLs(text);
        tags = extractHashtags(text);
      }

      // 2. If regex found nothing in text, try AI on text (catches partial URLs)
      if (urls.length === 0 && text && isAIConfigured()) {
        logger.info("No regex URLs found, trying AI text extraction");
        urls = await extractLinksFromText(text);
        tags = extractHashtags(text);
        if (urls.length > 0) source = "ai-text";
      }

      // 3. If message has an image, try AI vision (screenshots, photos)
      if (hasImage && isAIConfigured()) {
        try {
          const buffer = await downloadMediaMessage(msg, "buffer", {});
          const imageBuffer = Buffer.isBuffer(buffer)
            ? buffer
            : Buffer.from(buffer as Uint8Array);
          const mimetype =
            (msg.message as any)?.imageMessage?.mimetype ?? "image/jpeg";

          logger.info("Extracting links from image via AI");
          const imageUrls = await extractLinksFromImage(imageBuffer, mimetype);

          if (imageUrls.length > 0) {
            // Merge with any text URLs (deduplicate)
            const existing = new Set(urls);
            for (const u of imageUrls) {
              if (!existing.has(u)) urls.push(u);
            }
            if (source === "regex" && imageUrls.length > 0)
              source = "ai-image";
          }
        } catch (error) {
          logger.error("Failed to download/process image", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // --- Save plain text as a note bookmark (no URLs found) ---
      if (urls.length === 0) {
        if (text && remoteJid && sock) {
          // Strip hashtags to get the "body" text
          const noteBody = text.replace(/#\w+/g, "").trim();

          // Skip empty, too-short, or emoji-only messages
          const isEmojiOnly = /^\p{Emoji_Presentation}+$/u.test(noteBody);
          if (noteBody.length >= 3 && !isEmojiOnly) {
            try {
              const noteUrl = `note://${Date.now()}`;
              const noteTitle = text.length > 100 ? text.slice(0, 100) : text;
              const aiReady = isAIConfigured();

              const [inserted] = await db.insert(bookmarks).values({
                url: noteUrl,
                title: noteTitle,
                description: text,
                domain: "note",
                tags: tags.length > 0 ? tags : [],
                source: "whatsapp",
                whatsappMessageId: msg.key.id,
                metadataStatus: "skipped",
                summaryStatus: "skipped",
                embeddingStatus: "pending",
              }).returning();

              logger.info("Note saved", { noteUrl, title: noteTitle, tags });

              // Auto-tag when no user-provided hashtags
              if (aiReady && inserted && tags.length === 0) {
                generateTags(noteUrl, noteTitle, text)
                  .then(async (aiTags) => {
                    if (aiTags.length > 0) {
                      await db
                        .update(bookmarks)
                        .set({ tags: aiTags, updatedAt: new Date() })
                        .where(eq(bookmarks.id, inserted.id));
                      logger.info("Auto-tags generated for note", { noteUrl, tags: aiTags });
                    }
                  })
                  .catch((err) => {
                    logger.error("Auto-tagging error for note", {
                      noteUrl,
                      error: err instanceof Error ? err.message : String(err),
                    });
                  });
              }

              await sock.sendMessage(remoteJid, {
                react: { text: "\uD83D\uDCDD", key: msg.key },
              });
            } catch (error) {
              logger.error("Failed to save note", { error });
            }
          }
        }
        continue;
      }

      // --- Save each extracted URL as a bookmark ---
      let savedCount = 0;
      let duplicateCount = 0;

      for (const url of urls) {
        try {
          logger.info("Processing URL from WhatsApp", {
            url,
            tags,
            source,
            chatJid: (remoteJid ?? "").split(":")[0],
          });

          const [existing] = await db
            .select({ id: bookmarks.id, title: bookmarks.title })
            .from(bookmarks)
            .where(eq(bookmarks.url, url))
            .limit(1);

          if (existing) {
            logger.info("Bookmark already exists", { url });
            duplicateCount++;
            continue;
          }

          const metadata = await fetchMetadata(url);

          // Extract user's note: remaining text after removing URLs and hashtags
          const userNote = text
            ? text
                .replace(/https?:\/\/[^\s]+/gi, "")
                .replace(/#\w+/g, "")
                .trim()
            : "";

          const aiReady = isAIConfigured();

          const [inserted] = await db.insert(bookmarks).values({
            url,
            title: metadata.title ?? url,
            description: userNote || (metadata.description ?? null),
            image: metadata.image ?? null,
            favicon: metadata.favicon ?? null,
            domain: metadata.domain,
            tags: tags.length > 0 ? tags : [],
            source: "whatsapp",
            whatsappMessageId: msg.key.id,
            metadataStatus: metadata.success ? "complete" : "failed",
            summaryStatus: aiReady ? "pending" : "skipped",
          }).returning();

          logger.info("Bookmark saved", { url, title: metadata.title, tags, source });
          savedCount++;

          // Fire-and-forget: generate AI summary + auto-tags
          logger.info("AI processing check", {
            url,
            aiReady,
            insertedId: inserted?.id,
            metadataSuccess: metadata.success,
            metadataTitle: metadata.title ?? "(none)",
          });

          if (aiReady && inserted) {
            const metaTitle = metadata.title ?? null;
            const metaDesc = metadata.description ?? null;

            generateSummary(url, metaTitle, metaDesc)
              .then(async (summary) => {
                if (summary) {
                  await db
                    .update(bookmarks)
                    .set({ summary, summaryStatus: "complete", updatedAt: new Date() })
                    .where(eq(bookmarks.id, inserted.id));
                  logger.info("Summary generated", { url });
                } else {
                  await db
                    .update(bookmarks)
                    .set({ summaryStatus: "failed", updatedAt: new Date() })
                    .where(eq(bookmarks.id, inserted.id));
                }
              })
              .catch((err) => {
                logger.error("Summary generation error", {
                  url,
                  error: err instanceof Error ? err.message : String(err),
                });
              });

            // Auto-tag when no user-provided tags
            if (tags.length === 0) {
              generateTags(url, metaTitle, metaDesc)
                .then(async (aiTags) => {
                  if (aiTags.length > 0) {
                    await db
                      .update(bookmarks)
                      .set({ tags: aiTags, updatedAt: new Date() })
                      .where(eq(bookmarks.id, inserted.id));
                    logger.info("Auto-tags generated", { url, tags: aiTags });
                  }
                })
                .catch((err) => {
                  logger.error("Auto-tagging error", {
                    url,
                    error: err instanceof Error ? err.message : String(err),
                  });
                });
            }
          }
        } catch (error) {
          logger.error("Failed to save bookmark", { url, error });
        }
      }

      // --- React to the message based on results ---
      if (remoteJid && sock) {
        try {
          let reaction = "❌";
          if (savedCount > 0) reaction = "🔖";
          else if (duplicateCount > 0) reaction = "⚠️";

          await sock.sendMessage(remoteJid, {
            react: { text: reaction, key: msg.key },
          });

          // If multiple links saved from one message, send a summary
          if (savedCount > 1) {
            await sock.sendMessage(
              remoteJid,
              { text: `📎 Saved ${savedCount} links from ${source === "ai-image" ? "image" : "message"}` },
              { quoted: msg },
            );
          }
        } catch (reactErr) {
          logger.error("Failed to send reaction", { reactErr, msgKey: msg.key });
        }
      }
    }
  });
}

export function getSocket(): WASocket | null {
  return sock;
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
