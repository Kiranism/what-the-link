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
const webDistPath = path.join(__dirname, "../../web/dist");
const staticRoot = path.join(webDistPath, "client");

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

// Serve static assets from the client build
app.use(
  "/assets/*",
  serveStatic({
    root: staticRoot,
    rewriteRequestPath: (p) => p,
  }),
);
app.get("/robots.txt", serveStatic({ root: staticRoot, path: "/robots.txt" }));

// SSR: delegate all other requests to TanStack Start's server handler
app.all("/*", async (c) => {
  try {
    const serverPath = path.join(webDistPath, "server", "server.js");
    const ssrModule = await import(serverPath);
    const handler = ssrModule.default;
    const response = await handler.fetch(c.req.raw);
    return response;
  } catch (err) {
    console.error("SSR error:", err);
    return c.json({ error: "Failed to render page" }, 500);
  }
});

app.onError((err, c) => {
  console.error("Server error:", err);
  return c.json(
    { error: err.message ?? "Internal server error" },
    500,
  );
});
