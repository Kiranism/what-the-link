import path from "path";
import { fileURLToPath } from "url";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { serveStatic } from "@hono/node-server/serve-static";
import { bookmarksRouter } from "./routes/bookmarks";
import { settingsRouter } from "./routes/settings";
import { whatsappRouter } from "./routes/whatsapp";
import { authMiddleware } from "./middleware/auth";
import { env } from "@bookmark/env/server";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticRoot = path.join(__dirname, "../../web/dist/client");

export const app = new Hono();

app.use("*", honoLogger());
app.use(
  "*",
  cors({
    origin: env.CORS_ORIGIN ?? "*",
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

app.get("/health", (c) =>
  c.json({ status: "ok", timestamp: Date.now() }),
);

app.route("/api/whatsapp", whatsappRouter);

app.use("/api/bookmarks/*", authMiddleware);
app.route("/api/bookmarks", bookmarksRouter);

app.use("/api/settings/*", authMiddleware);
app.route("/api/settings", settingsRouter);

app.use("/*", serveStatic({ root: staticRoot }));

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((err, c) => {
  console.error("Server error:", err);
  return c.json(
    { error: err.message ?? "Internal server error" },
    500,
  );
});
