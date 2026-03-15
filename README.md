# 𝙒𝞖𝞓𝞣 𝞣𝞖𝞢 𝙇𝞘𝞟𝞙¯\_(ツ)_/¯

Self-hosted, single-user bookmark manager that saves links sent via WhatsApp, fetches metadata, and provides a web UI for searching and organizing bookmarks.

## Features

- **WhatsApp integration** — Send a link in any chat; it's saved automatically (via Baileys)
- **Metadata** — Title, description, and image from Open Graph
- **Web UI** — Search, filter by tags/domain, favorites, keyboard shortcuts
- **Single user** — Password-protected; no OAuth
- **Self-hosted** — Runs on any VPS with Docker (Oracle Cloud free tier works great)

## Tech Stack

- **Frontend:** TanStack Start (React), Tailwind, shadcn-style UI
- **Backend:** Hono
- **Database:** SQLite (Turso / libsql), Drizzle ORM
- **WhatsApp:** Baileys (unofficial Web API)

## Quick Start (local dev)

```bash
# 1. Install
git clone https://github.com/Kiranism/what-the-link.git
cd what-the-link
npm install
cp .env.example apps/server/.env

# 2. Set APP_PASSWORD in apps/server/.env

# 3. Database
npm run db:push

# 4. Run
npm run dev
```

- Web: http://localhost:3001
- API: http://localhost:3000

Open the web app, enter your password, go to **Settings**, scan the QR with WhatsApp, and start sending links.

## Deploy (Docker)

```bash
git clone https://github.com/Kiranism/what-the-link.git
cd what-the-link
echo 'APP_PASSWORD=your-secure-password' > .env
docker compose up -d --build
```

Open `http://<your-server-ip>:3000`.

See [deploy.md](deploy.md) for the full guide — domain setup, HTTPS, backups, migration, and troubleshooting.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `APP_PASSWORD` | Yes | Password for web UI and API |
| `DATABASE_URL` | No | SQLite path (default: `file:/data/bookmarks.db`) |
| `WA_AUTH_DIR` | No | WhatsApp session dir (default: `/data/whatsapp_auth`) |
| `WA_ALLOWED_GROUP_JID` | No | Limit bookmarks to one WhatsApp group |
| `CORS_ORIGIN` | No | CORS origin (default: `*`) |

## API

- `GET /health` — Health check (no auth)
- `GET /api/whatsapp/qr` — QR code for WhatsApp linking (no auth)
- `GET /api/whatsapp/status` — Connection status
- `GET /api/bookmarks` — List (query: `search`, `tag`, `domain`, `favorite`, `archived`, `limit`, `offset`)
- `GET /api/bookmarks/export?format=json|html` — Export bookmarks
- `POST /api/bookmarks/import` — Import bookmarks (JSON)
- `POST /api/bookmarks` — Create bookmark
- `PATCH /api/bookmarks/:id` — Update
- `DELETE /api/bookmarks/:id` — Delete

All `/api/bookmarks/*` and `/api/settings/*` endpoints require `Authorization: Bearer <APP_PASSWORD>`.

## Project Structure

```
what-the-link/
├── apps/
│   ├── web/            # TanStack Start frontend
│   └── server/         # Hono API + WhatsApp (Baileys)
├── packages/
│   ├── db/             # Drizzle schema + migrations
│   ├── env/            # Env validation (Zod)
│   ├── types/          # Shared TypeScript types
│   └── ui/             # Shared UI components
├── Dockerfile
├── docker-compose.yml
├── deploy.md           # Full deployment guide
├── knowledge.md        # Architecture deep-dive
└── .env.example
```

## Scripts

- `npm run dev` — Run web + server
- `npm run dev:web` / `npm run dev:server` — Run one app
- `npm run build` — Build all
- `npm run db:push` — Push schema
- `npm run db:generate` — Generate migrations
- `npm run db:migrate` — Run migrations
- `npm run db:studio` — Drizzle Studio

## License

MIT
