# WhatsApp Bookmark Manager

Self-hosted, single-user bookmark manager that saves links sent via WhatsApp, fetches metadata, and provides a web UI for searching and organizing bookmarks.

## Features

- **WhatsApp integration** — Send a link in any chat; it’s saved automatically (via Baileys)
- **Metadata** — Title, description, and image from Open Graph
- **Web UI** — Search, filter by tags/domain, favorites, tag editing
- **Single user** — Password-protected; no OAuth
- **Free-tier friendly** — Designed for Fly.io (or similar) with SQLite/Turso

## Tech Stack

- **Frontend:** TanStack Start (React), Tailwind, shadcn-style UI
- **Backend:** Hono
- **Database:** SQLite (Turso / libsql), Drizzle ORM
- **WhatsApp:** Baileys (unofficial Web API)

## Quick Start (local)

1. **Install and env**

   ```bash
   npm install
   cp .env.example apps/server/.env
   ```

2. **Set in `apps/server/.env`:**
   - `DATABASE_URL` — e.g. `file:./data/bookmarks.db` or a Turso URL
   - `APP_PASSWORD` — Password for the web UI and API

3. **Database**

   ```bash
   npm run db:push
   # or: npm run db:generate && npm run db:migrate
   ```

4. **Run**

   ```bash
   npm run dev
   ```

   - Web: [http://localhost:3001](http://localhost:3001)
   - API: [http://localhost:3000](http://localhost:3000)
   - WhatsApp QR: [http://localhost:3000/api/whatsapp/qr](http://localhost:3000/api/whatsapp/qr)

5. **First use**
   - Open the web app, enter `APP_PASSWORD`.
   - Go to **Setup**, scan the QR with WhatsApp (Linked devices).
   - Send a link in any WhatsApp chat; it should appear under **Bookmarks**.

## Deploy to Fly.io

1. **Fork/clone** and install [Fly CLI](https://fly.io/docs/hands-on/install-flyctl/).

2. **Create app and volume**

   ```bash
   flyctl launch
   flyctl volumes create whatsapp_data --size 1 --region sin
   ```

3. **Secrets**

   ```bash
   flyctl secrets set APP_PASSWORD="your-secure-password"
   flyctl secrets set DATABASE_URL="file:/data/bookmarks.db"
   ```

4. **Deploy**

   ```bash
   flyctl deploy
   ```

5. **Connect WhatsApp**
   - Open `https://<your-app>.fly.dev/api/whatsapp/qr`
   - Scan with WhatsApp → Linked devices → Link a device.

6. **Use the app**
   - Open `https://<your-app>.fly.dev`, enter your password, then use Bookmarks / Search / Setup / Settings.

### GitHub Actions

To deploy on push to `main`, add `FLY_API_TOKEN` to the repo secrets and use the workflow in `.github/workflows/deploy.yml`.

## Environment variables

| Variable       | Required | Description                                            |
| -------------- | -------- | ------------------------------------------------------ |
| `DATABASE_URL` | Yes      | SQLite/Turso URL or `file:...` path                    |
| `APP_PASSWORD` | Yes      | Password for API and web UI                            |
| `WA_AUTH_DIR`  | No       | WhatsApp session dir (default: `./data/whatsapp_auth`) |
| `CORS_ORIGIN`  | No       | CORS origin (default: `*`)                             |

## API

- `GET /health` — Health check (no auth).
- `GET /api/whatsapp/qr` — Current QR payload (no auth).
- `GET /api/whatsapp/status` — Connection status.
- `GET /api/bookmarks` — List (query: `search`, `tag`, `domain`, `favorite`, `archived`, `limit`, `offset`). Auth: `Authorization: Bearer <APP_PASSWORD>`.
- `GET /api/bookmarks/:id` — One bookmark.
- `POST /api/bookmarks` — Create (body: `url`, optional `title`, `tags`, etc.).
- `PATCH /api/bookmarks/:id` — Update.
- `DELETE /api/bookmarks/:id` — Delete.

## Project structure

```
bookmark/
├── apps/
│   ├── web/           # TanStack Start frontend
│   └── server/       # Hono API + WhatsApp (Baileys)
├── packages/
│   ├── db/            # Drizzle schema + migrations
│   ├── env/            # Env validation
│   ├── types/         # Shared types
│   └── ui/            # Shared UI components
├── Dockerfile
├── fly.toml
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
