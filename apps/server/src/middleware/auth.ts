import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { env } from "@bookmark/env/server";

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");

  if (!authHeader) {
    throw new HTTPException(401, { message: "Authorization header required" });
  }

  const [type, token] = authHeader.split(" ");

  if (type !== "Bearer" || token !== env.APP_PASSWORD) {
    throw new HTTPException(401, { message: "Invalid credentials" });
  }

  await next();
}
