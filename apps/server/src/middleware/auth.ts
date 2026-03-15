import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { getCookie } from "hono/cookie";
import { env } from "@bookmark/env/server";

// --- Rate limiting for failed auth attempts ---
const failedAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function getClientIp(c: Context): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    c.req.header("x-real-ip") ??
    "unknown"
  );
}

function checkRateLimit(c: Context): void {
  const ip = getClientIp(c);
  const now = Date.now();
  const record = failedAttempts.get(ip);

  if (record && now < record.resetAt && record.count >= MAX_ATTEMPTS) {
    throw new HTTPException(429, {
      message: "Too many failed attempts. Try again later.",
    });
  }
}

function recordFailure(c: Context): void {
  const ip = getClientIp(c);
  const now = Date.now();
  const record = failedAttempts.get(ip);

  if (!record || now >= record.resetAt) {
    failedAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    record.count++;
  }
}

function clearFailures(c: Context): void {
  failedAttempts.delete(getClientIp(c));
}

// --- Auth middleware ---
// Accepts either: httpOnly cookie "session" OR Authorization: Bearer <token>
export async function authMiddleware(c: Context, next: Next) {
  checkRateLimit(c);

  const sessionCookie = getCookie(c, "session");
  const authHeader = c.req.header("Authorization");

  let authenticated = false;

  // Check cookie first
  if (sessionCookie && sessionCookie === env.APP_PASSWORD) {
    authenticated = true;
  }

  // Fall back to Bearer token
  if (!authenticated && authHeader) {
    const [type, token] = authHeader.split(" ");
    if (type === "Bearer" && token === env.APP_PASSWORD) {
      authenticated = true;
    }
  }

  if (!authenticated) {
    recordFailure(c);
    throw new HTTPException(401, { message: "Invalid credentials" });
  }

  clearFailures(c);
  await next();
}
