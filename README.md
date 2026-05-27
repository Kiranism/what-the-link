# 𝙒𝞖𝞓𝞣 𝞣𝞖𝞢 𝙇𝞘𝞟𝞙¯\_(ツ)\_/¯

## Demo

https://github.com/user-attachments/assets/db65afbb-ad41-4d1f-aff7-97ded50c98d7

## Why another bookmarking tool?

Have you ever used WhatsApp as your personal bookmarking tool? I did. I'd send myself links — articles, products, posts — right in a private group chat. But finding them later? A nightmare. Endless scrolling, lost links, no way to search.

That's why I built **What The Link**. It's a self-hosted bookmarking tool that plugs directly into WhatsApp. Scan the QR, link your group, and every link you send is automatically saved with metadata, organized, and searchable. Tag links with hashtags right in the chat. Ask later — *"show me all GitHub bookmarks"* — and they appear instantly.

No more scrolling. No more lost links. Just your bookmarks, right where you want them.

## Features

- **WhatsApp integration** — Send a link in your chat; it's saved automatically
- **Metadata** — Title, description, and image fetched from Open Graph (Firecrawl-primary with cheerio fallback so anti-bot e-commerce pages still resolve)
- **Tagging** — Add `#hashtags` alongside your links to organize them
- **Shop collection** — Links from Myntra, Amazon, Flipkart, Ajio, Nykaa and 25+ other stores are auto-detected, classified into a category (watches, shoes, electronics, ...) and grouped on a dedicated `/shop` page
- **WhatsApp shortcuts** — `?shop` for a numbered category menu, `?shop watches` to drill in, bare-number or quoted-reply to pick from the last menu
- **Web UI** — Search, filter by tags/domain, keyboard shortcuts
- **Single user** — Password-protected; no OAuth
- **Self-hosted** — Runs on any VPS with Docker

## Tech Stack

- **Frontend:** TanStack Start (React), Tailwind, shadcn-style UI
- **Backend:** Hono
- **Database:** SQLite (Turso / libsql), Drizzle ORM
- **WhatsApp:** Baileys (unofficial Web API)
- **AI:** OpenRouter (chat model + embeddings) for tagging, summarization and smart search; Firecrawl for JS-rendered / anti-bot page scraping

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

## Deploy

### One-command install (VPS)

```bash
curl -fsSL https://raw.githubusercontent.com/Kiranism/what-the-link/main/install.sh | bash
```

Installs Docker if needed, prompts for your password, builds and starts the app.

### Docker Compose (manual)

```bash
git clone https://github.com/Kiranism/what-the-link.git
cd what-the-link
echo 'APP_PASSWORD=your-secure-password' > .env
docker compose up -d --build
```

Open `http://<your-server-ip>:3000`.

See [how-to-deploy.md](how-to-deploy.md) for the full guide — domain setup, HTTPS, backups, migration, and troubleshooting.

## Environment Variables

| Variable                     | Required | Description                                                                                          |
| ---------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `APP_PASSWORD`               | Yes      | Password for web UI and API                                                                          |
| `DATABASE_URL`               | No       | SQLite path (default: `file:/data/bookmarks.db`)                                                     |
| `WA_AUTH_DIR`                | No       | WhatsApp session dir (default: `/data/whatsapp_auth`)                                                |
| `WA_ALLOWED_GROUP_JID`       | No       | Limit bookmarks to one WhatsApp group                                                                |
| `CORS_ORIGIN`                | No       | CORS origin (default: `*`)                                                                           |
| `OPENROUTER_API_KEY`         | No       | Enables AI summaries, tags, embeddings, smart search and shop category classification                |
| `OPENROUTER_CHAT_MODEL`      | No       | Override chat model (default: `google/gemini-2.5-flash-lite`)                                        |
| `OPENROUTER_EMBEDDING_MODEL` | No       | Override embedding model (default: `google/gemini-embedding-001`)                                    |
| `FIRECRAWL_API_KEY`          | No       | When set, Firecrawl becomes the primary fetcher for every URL (cheerio drops to fallback)            |

## WhatsApp Commands

Send these in the chat the bot is linked to (or your `WA_ALLOWED_GROUP_JID` group):

| Command             | What it does                                                                  |
| ------------------- | ----------------------------------------------------------------------------- |
| `<any URL>`         | Saves the link with metadata + AI tags (and shop category if applicable)      |
| `#tag1 #tag2 <URL>` | Saves with your tags instead of AI-generated ones                             |
| `?help`             | Show command reference                                                        |
| `?<query>`          | Search bookmarks (semantic when AI is enabled, LIKE fallback otherwise)       |
| `?#tag`             | Filter by tag                                                                 |
| `?recent` / `?recent 10` | Show last N bookmarks                                                    |
| `?shop`             | List shop categories with counts (numbered menu, 5-min TTL)                   |
| `?shop watches`     | List products in a category with direct URLs                                  |
| `1`, `2`, ... or `watches` | After `?shop`, drill into a category by number or name                 |
| Quoted reply to menu | Long-press the menu → reply → type number/category — also drills in          |

## API

- `GET /health` — Health check (no auth)
- `POST /api/login` — Login (sets httpOnly session cookie)
- `POST /api/logout` — Logout (clears session cookie)
- `GET /api/whatsapp/qr` — QR code for WhatsApp linking
- `GET /api/whatsapp/status` — Connection status
- `GET /api/bookmarks` — List (query: `search`, `tag`, `domain`, `collection`, `archived`, `limit`, `offset`)
- `GET /api/bookmarks/shop` — Shopping collection grouped by category (`{groups: [{category, items, count}], total}`)
- `GET /api/bookmarks/export?format=json|html` — Export bookmarks
- `POST /api/bookmarks/import` — Import bookmarks (JSON)
- `POST /api/bookmarks` — Create bookmark
- `PATCH /api/bookmarks/:id` — Update
- `DELETE /api/bookmarks/:id` — Delete

All endpoints except `/health` and `/api/login` require authentication (httpOnly session cookie or `Authorization: Bearer <APP_PASSWORD>`).

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
├── how-to-deploy.md           # Full deployment guide
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
