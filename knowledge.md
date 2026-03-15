# Knowledge Base — 𝙒𝞖𝞓𝞣 𝞣𝞖𝞢 𝙇𝞘𝞟𝞙¯\_(ツ)_/¯

## Architecture Overview

Single-container monorepo app: the Hono server serves both the API and the SSR'd frontend from one process.

```
┌─────────────────────────────────────────────┐
│              Docker Container               │
│                                             │
│  ┌───────────────────────────────────────┐   │
│  │  Node.js (apps/server/dist/index.mjs) │   │
│  │                                       │   │
│  │  ├── /api/bookmarks/*   (REST API)    │   │
│  │  ├── /api/whatsapp/*    (WA endpoints)│   │
│  │  ├── /api/settings/*    (config)      │   │
│  │  ├── /assets/*          (static files)│   │
│  │  ├── /health            (healthcheck) │   │
│  │  └── /*                 (SSR via      │   │
│  │                          TanStack)    │   │
│  └───────────────────────────────────────┘   │
│                                             │
│  ┌───────────────────────────────────────┐   │
│  │  /data (persistent volume)            │   │
│  │  ├── bookmarks.db       (SQLite DB)   │   │
│  │  └── whatsapp_auth/     (WA sessions) │   │
│  └───────────────────────────────────────┘   │
│                                             │
│  Port: 3000                                 │
└─────────────────────────────────────────────┘
```

## Monorepo Layout

```
bookmark/
├── apps/
│   ├── server/        # Hono API + WhatsApp connector
│   │   └── src/
│   │       ├── index.ts           # Entry point, startup sequence
│   │       ├── app.ts             # Hono app, middleware, routes
│   │       ├── middleware/auth.ts  # Bearer token auth
│   │       ├── routes/            # bookmarks, settings, whatsapp
│   │       ├── services/          # whatsapp/, metadata, settings
│   │       └── utils/             # logger, url-extractor
│   └── web/           # TanStack Start (React SSR) frontend
│       └── src/
│           ├── routes/            # pages (index, settings)
│           ├── components/        # UI components
│           ├── hooks/             # useAuth, useKeyboardShortcuts
│           └── utils/             # api client, formatters
├── packages/
│   ├── db/            # Drizzle schema, migrations, client
│   ├── env/           # Zod-validated env vars (server + web)
│   ├── types/         # Shared TypeScript types
│   └── ui/            # Shared UI components (shadcn-style)
├── Dockerfile         # Multi-stage build
├── docker-compose.yml # Docker Compose for VPS deployment
├── deploy.md          # Full deployment guide
└── knowledge.md       # This file
```

## How It Runs

### Local Development

Two dev servers running simultaneously:

| Process         | Port | What it does                       |
|-----------------|------|------------------------------------|
| `apps/server`   | 3000 | Hono API + WhatsApp (via `tsx`)    |
| `apps/web`      | 3001 | Vite dev server (HMR, SSR)        |

Web app calls API at `VITE_SERVER_URL=http://localhost:3000`.

```bash
npm run dev          # runs both
npm run dev:server   # server only
npm run dev:web      # web only
```

### Production (Docker / Fly.io)

Single process serves everything:

1. `apps/web` is built to `apps/web/dist/` (client + server bundles)
2. `apps/server` is bundled to `apps/server/dist/index.mjs` (includes all `@bookmark/*` packages)
3. The server serves static assets from `apps/web/dist/client/` and SSR via `apps/web/dist/server/server.js`
4. `VITE_SERVER_URL` is cleared during build so the frontend calls APIs on the same origin

## Database

**Engine:** SQLite via LibSQL/Turso

**ORM:** Drizzle

| Mode       | DATABASE_URL                        | Notes                              |
|------------|-------------------------------------|------------------------------------|
| Local dev  | `file:./data/bookmarks.db`          | File in `apps/server/data/`        |
| Production | `file:/data/bookmarks.db`           | On persistent volume               |
| Turso      | `libsql://your-db.turso.io?token=…` | Serverless edge DB (optional)      |

**Tables:** `bookmarks`, `app_settings`, `tags`

**Migrations:** Auto-run on server startup via `runMigrations()`. Located in `packages/db/src/migrations/`.

```bash
npm run db:push      # push schema directly (dev)
npm run db:generate  # generate migration SQL
npm run db:migrate   # run migrations
npm run db:studio    # Drizzle Studio GUI
```

## Environment Variables

| Variable              | Required | Where       | Description                                     |
|-----------------------|----------|-------------|-------------------------------------------------|
| `DATABASE_URL`        | Yes      | Server      | SQLite file path or Turso URL                   |
| `APP_PASSWORD`        | Yes      | Server      | Password for web UI login and API Bearer token  |
| `CORS_ORIGIN`         | No       | Server      | Allowed CORS origin (default: `*`)              |
| `WA_AUTH_DIR`         | No       | Server      | WhatsApp session dir (default: `./data/whatsapp_auth`) |
| `WA_ALLOWED_GROUP_JID`| No      | Server      | Filter bookmarks to one WhatsApp group          |
| `NODE_ENV`            | No       | Server      | `development` / `production` / `test`           |
| `PORT`                | No       | Server      | HTTP port (default: `3000`)                     |
| `VITE_SERVER_URL`     | No       | Web (build) | API base URL — clear for production (same origin) |

## Deployment on Fly.io

### What you need
- [Fly CLI](https://fly.io/docs/hands-on/install-flyctl/) installed
- A Fly.io account

### Infrastructure
- **1 machine** — shared CPU, 1GB RAM
- **1 volume** — 1GB at `/data` (stores DB + WhatsApp auth)
- **Region** — `bom` (Mumbai) by default, change in `fly.toml`

### Steps

```bash
# 1. Create app
flyctl launch

# 2. Create persistent volume (pick your region)
flyctl volumes create whatsapp_data --size 1 --region bom

# 3. Set secrets
flyctl secrets set APP_PASSWORD="your-secure-password"
flyctl secrets set DATABASE_URL="file:/data/bookmarks.db"

# 4. Deploy
flyctl deploy
```

### CI/CD (GitHub Actions)

See [deploy.md](deploy.md) for the full step-by-step guide.

### Health Check

`GET /health` — returns `{ status: "ok", timestamp: ... }`

Fly checks every 10s, 2s timeout, 10s grace period on startup.

## Hosting Elsewhere

Since it's a standard Docker container, you can host anywhere that supports:
- Docker containers
- Persistent volumes (for `/data`)
- Port 3000 exposed

### Requirements
1. **Persistent storage** at `/data` — the SQLite database and WhatsApp session must survive restarts
2. **Single instance** — SQLite doesn't support concurrent writers, so run only 1 container
3. **Always-on** — WhatsApp connection drops if the container sleeps (no serverless)

### Example platforms
| Platform       | Persistent Volume | Always-on | Notes                         |
|----------------|-------------------|-----------|-------------------------------|
| **Fly.io**     | Yes (volumes)     | Yes       | Recommended, config included  |
| **Railway**    | Yes               | Yes       | Works out of the box          |
| **Render**     | Yes (disks)       | Yes       | Use "Background Worker" type  |
| **VPS** (any)  | Yes (filesystem)  | Yes       | docker-compose, bind mount    |
| **Coolify**    | Yes               | Yes       | Self-hosted PaaS              |
| Vercel/Netlify | No                | No        | Won't work (serverless)       |
| AWS Lambda     | No                | No        | Won't work (no persistence)   |

### docker-compose (VPS)

```yaml
version: "3.8"
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=file:/data/bookmarks.db
      - APP_PASSWORD=your-secure-password
      - NODE_ENV=production
    volumes:
      - app_data:/data
    restart: unless-stopped

volumes:
  app_data:
```

## Build Pipeline

```
npm install
    │
    ├── Build web (TanStack Start + Vite)
    │   └── outputs: apps/web/dist/{client,server}
    │
    ├── Build server (tsdown bundles to single ESM file)
    │   └── outputs: apps/server/dist/index.mjs
    │
    └── Copy migrations to server dist
        └── apps/server/dist/migrations/
```

The server bundle includes all `@bookmark/*` packages (db, env, types) — no external workspace deps needed at runtime.

## Authentication Flow

1. User opens the web app → `AuthGuard` checks localStorage for stored password
2. If no password or invalid → shows login screen
3. On submit → validates against `GET /api/bookmarks?limit=1` with `Authorization: Bearer <password>`
4. Server's `authMiddleware` compares token to `APP_PASSWORD` env var
5. On success → password stored in localStorage, all API calls include Bearer header

## WhatsApp Integration

**Library:** Baileys (unofficial WhatsApp Web API)

**How it works:**
1. On startup, server connects to WhatsApp using stored session in `WA_AUTH_DIR`
2. If no session → generates QR code at `/api/whatsapp/qr`
3. User scans QR with WhatsApp → Linked Devices
4. Bot listens for messages containing URLs
5. URLs are extracted, metadata fetched (title, description, image via Cheerio), and saved as bookmarks
6. Bot responds in chat with confirmation

**Commands (in WhatsApp):**
- Send any URL → saves as bookmark
- `#tag1 #tag2` with URL → adds tags

- `?<query>` → searches bookmarks



**Important:** WhatsApp session persists in `/data/whatsapp_auth`. If this directory is lost, you'll need to re-scan the QR code.
