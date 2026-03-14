import { serve } from "@hono/node-server";
import { runMigrations, dbClient } from "@bookmark/db";
import { app } from "./app";
import { ensureAppSettingsTable, getAppSettings } from "./services/settings";
import { initWhatsApp } from "./services/whatsapp";
import { startMetadataRetryJob } from "./services/metadata-retry";
import { logger } from "./utils/logger";

async function ensureNewColumns(): Promise<void> {
  const cols = [
    { name: "metadata_status", sql: "ALTER TABLE bookmarks ADD COLUMN metadata_status TEXT NOT NULL DEFAULT 'complete'" },
    { name: "metadata_retries", sql: "ALTER TABLE bookmarks ADD COLUMN metadata_retries INTEGER NOT NULL DEFAULT 0" },
  ];
  for (const col of cols) {
    try {
      await dbClient.execute(col.sql);
      logger.info(`Added column: ${col.name}`);
    } catch (e: any) {
      // Column already exists — ignore
      if (e?.message?.includes("duplicate column")) continue;
      if (e?.message?.includes("already exists")) continue;
      throw e;
    }
  }
}

const PORT = Number(process.env.PORT) || 3000;
const MAX_PORT_ATTEMPTS = 10;

function startListening(port: number): void {
  const server = serve({
    fetch: app.fetch,
    port,
    hostname: "0.0.0.0",
  });

  server.once("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      if (port - PORT < MAX_PORT_ATTEMPTS - 1) {
        logger.warn(`Port ${port} in use, trying ${port + 1}...`);
        server.close(() => startListening(port + 1));
      } else {
        logger.error(
          `No free port in range ${PORT}–${PORT + MAX_PORT_ATTEMPTS - 1}. Free one: lsof -ti:${port} | xargs kill`,
        );
        process.exit(1);
      }
    } else {
      logger.error("Server error", { error: err });
      process.exit(1);
    }
  });

  server.once("listening", () => {
    logger.info(`Server listening on http://localhost:${port}`);
    logger.info(`WhatsApp setup: http://localhost:${port}/api/whatsapp/qr`);
  });
}

async function main() {
  logger.info("Starting WhatsApp Bookmark Server...");

  try {
    await runMigrations();
    logger.info("Database migrations complete");
  } catch (e: any) {
    // If migrations fail because tables already exist (pre-migration DB), that's OK
    if (e?.message?.includes("already exists")) {
      logger.warn("Migration skipped (tables already exist), applying column updates...");
    } else {
      throw e;
    }
  }

  await ensureNewColumns();
  await ensureAppSettingsTable();
  await getAppSettings();
  logger.info("App settings loaded");

  await initWhatsApp();
  logger.info("WhatsApp connector initialized");

  startMetadataRetryJob();

  startListening(PORT);
}

main().catch((error: unknown) => {
  const err = error instanceof Error ? error : new Error(String(error));
  logger.error("Failed to start server", {
    message: err.message,
    stack: err.stack,
    cause: err.cause,
  });
  process.exit(1);
});

process.on("SIGINT", () => {
  logger.info("Shutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("Received SIGTERM, shutting down gracefully...");
  process.exit(0);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled rejection", {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});
