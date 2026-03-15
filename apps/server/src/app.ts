import path from "path";
import { fileURLToPath } from "url";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { serveStatic } from "@hono/node-server/serve-static";
import { setCookie, deleteCookie } from "hono/cookie";
import { bookmarksRouter } from "./routes/bookmarks";
import { settingsRouter } from "./routes/settings";
import { whatsappRouter } from "./routes/whatsapp";
import { authMiddleware } from "./middleware/auth";
import { env } from "@bookmark/env/server";
import { logger } from "./utils/logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDistPath = path.join(__dirname, "../../web/dist");
const staticRoot = path.join(webDistPath, "client");

export const app = new Hono();

app.use("*", honoLogger());
app.use(
  "*",
  cors({
    origin: env.CORS_ORIGIN ?? (env.NODE_ENV === "production" ? "same-origin" : "*"),
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.get("/health", (c) =>
  c.json({ status: "ok", timestamp: Date.now() }),
);

// --- Cookie-based login/logout ---
app.post("/api/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const password = (body as { password?: string }).password;

  if (!password || password !== env.APP_PASSWORD) {
    return c.json({ error: "Invalid password" }, 401);
  }

  setCookie(c, "session", password, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "Lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return c.json({ success: true });
});

app.post("/api/logout", (c) => {
  deleteCookie(c, "session", { path: "/" });
  return c.json({ success: true });
});

// --- Protected routes ---
app.use("/api/whatsapp/*", authMiddleware);
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
    logger.error("SSR error", { error: err instanceof Error ? err.message : String(err) });
    return c.json({ error: "Failed to render page" }, 500);
  }
});

app.onError((err, c) => {
  logger.error("Server error", { error: err.message });
  return c.json(
    { error: err.message ?? "Internal server error" },
    500,
  );
});
