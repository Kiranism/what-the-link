# What The Link ¯\\\_(ツ)\_/¯

**Self-hosted semantic search for everything you share on WhatsApp.**

Ask your WhatsApp *"that github repo about vector databases from last month"* and get the link back in the same chat, in seconds. No scrolling, no guessing the exact keyword.

## Demo

https://github.com/user-attachments/assets/db65afbb-ad41-4d1f-aff7-97ded50c98d7

## The problem

WhatsApp is where links end up. Articles, repos, products, reels, docs: people send them to friends, groups, or a private "notes to self" chat. Finding one a few weeks later means endless scrolling, because WhatsApp's built-in search only matches exact words and doesn't know what a link is *about*.

## How it works

1. Run What The Link on your own server (one command, Docker).
2. Scan a QR code to link it to WhatsApp as a linked device.
3. Every link shared in your chosen chat is saved automatically, with its title, description, preview image and AI-generated tags. Links inside screenshots are picked up too.
4. Each bookmark gets an embedding, so search works on meaning, not just keywords.
5. Ask a question in WhatsApp starting with `?` and the matching links come back as a reply. Or browse, filter and search in the web app.

```
you:   ?that article about sqlite in production
bot:   Search results for "that article about sqlite in production": ✨
       1. I'm All-In on Server-Side SQLite
          https://fly.io/blog/all-in-on-sqlite-litestream/
          #sqlite #database #devops
       2. ...
```

## Features

- **Semantic search.** Ask in plain language, results ranked by meaning via vector embeddings. Falls back to keyword search when AI is off.
- **Search from WhatsApp.** `?query`, `?#tag`, `?recent` work right inside the chat; results arrive as a reply.
- **Automatic capture.** Links are pulled from message text, from partial or mangled URLs (AI), and from screenshots (AI vision).
- **Rich metadata.** Title, description and image via Firecrawl (primary) with a cheerio fallback, so JS-heavy and anti-bot pages still resolve.
- **AI tags and summaries.** Or add your own `#hashtags` next to the link.
- **Shop collection.** Product links from any store (Amazon, Etsy, indie Shopify sites, no domain list to maintain) are detected from page content, sorted into categories like watches or shoes, and grouped on a `/shop` page. `?shop` gives you the same menu in WhatsApp.
- **Daily digest.** An optional evening WhatsApp message with what you saved that day (time is configurable in Settings).
- **Web app.** Search, filter by tag or domain, bulk archive / tag / delete, keyboard shortcuts, import from browser bookmarks, export to JSON.
- **Self-hosted and single user.** One password, no accounts, no OAuth. Runs on any small VPS.

## Privacy and data ownership

- Your bookmarks database (SQLite) and WhatsApp session live on **your** server, in `./data`.
- **Only links are stored.** Ordinary chat text is never indexed, so the passwords, OTPs and personal messages in your chats aren't saved or sent anywhere.
- Restrict capture to a single chat or group (pick it in Settings, or set `WA_ALLOWED_GROUP_JID`).
- AI is opt-in. Tags, summaries and semantic search call [OpenRouter](https://openrouter.ai) only if you add an API key; page fetching uses [Firecrawl](https://firecrawl.dev) only if you add a key. With no keys, everything runs locally with keyword search.
- MIT licensed. Read the code, change it, run it how you like.

## Why not just...

| Option | Trade-off |
| --- | --- |
| **WhatsApp's own search** | Exact-word matching only. No idea what a link is about, no tags, no cross-chat collection. |
| **A WhatsApp MCP server + Claude / Cursor** | Great for ad-hoc questions from a desktop AI client, but it queries raw chat history on demand and needs that client open. What The Link builds a curated, enriched, searchable library and answers from inside WhatsApp itself. |
| **ChatGPT / Claude memory** | You'd have to paste every link in manually, and the data lives with that provider. |

## Tech stack

- **Frontend:** TanStack Start (React), Tailwind, shadcn-style UI
- **Backend:** Hono
- **Database:** SQLite (libsql / Turso), Drizzle ORM
- **WhatsApp:** Baileys (unofficial WhatsApp Web API)
- **AI:** OpenRouter (chat model + embeddings) for tagging, summaries, link extraction and semantic search; Firecrawl for JS-rendered and anti-bot pages

## Quick start (local dev)

```bash
# 1. Install
git clone https://github.com/Kiranism/what-the-link.git
cd what-the-link
npm install
cp .env.example apps/server/.env

# 2. Set APP_PASSWORD in apps/server/.env
#    (optional) add OPENROUTER_API_KEY for semantic search

# 3. Database
npm run db:push

# 4. Run
npm run dev
```

- Web: http://localhost:3001
- API: http://localhost:3000

Open the web app, enter your password, go to **Settings**, scan the QR with WhatsApp, and start sharing links.

## Deploy

### One-command install (VPS)

```bash
curl -fsSL https://raw.githubusercontent.com/Kiranism/what-the-link/main/install.sh | bash
```

Installs Docker if needed, prompts for your password, then builds and starts the app.

### Docker Compose (manual)

```bash
git clone https://github.com/Kiranism/what-the-link.git
cd what-the-link
echo 'APP_PASSWORD=your-secure-password' > .env
docker compose up -d --build
```

Open `http://<your-server-ip>:3000`.

See [how-to-deploy.md](how-to-deploy.md) for the full guide: domain setup, HTTPS, backups, migration and troubleshooting.

## Environment variables

| Variable                     | Required | Description                                                                               |
| ---------------------------- | -------- | ----------------------------------------------------------------------------------------- |
| `APP_PASSWORD`               | Yes      | Password for the web UI and API                                                           |
| `DATABASE_URL`               | No       | SQLite / libsql URL (default: `file:/data/bookmarks.db`)                                  |
| `WA_AUTH_DIR`                | No       | WhatsApp session directory (default: `/data/whatsapp_auth`)                               |
| `WA_ALLOWED_GROUP_JID`       | No       | Only capture links from this chat. Can also be picked in Settings, which takes priority.  |
| `CORS_ORIGIN`                | No       | CORS origin (default: `*`)                                                                |
| `OPENROUTER_API_KEY`         | No       | Turns on AI tags, summaries, link extraction, embeddings, semantic search and shop categories |
| `OPENROUTER_CHAT_MODEL`      | No       | Override chat model (default: `google/gemini-2.5-flash-lite`)                             |
| `OPENROUTER_EMBEDDING_MODEL` | No       | Override embedding model (default: `google/gemini-embedding-001`)                         |
| `FIRECRAWL_API_KEY`          | No       | Makes Firecrawl the primary page fetcher for every URL (cheerio becomes the fallback)     |

## WhatsApp commands

Send these in the linked chat (or your allowed group):

| Command                    | What it does                                                               |
| -------------------------- | -------------------------------------------------------------------------- |
| `<any URL>`                | Saves the link with metadata and AI tags (plus a shop category if it's a product) |
| `<URL> #tag1 #tag2`        | Saves with your tags instead of AI-generated ones                          |
| A screenshot with a link   | Extracts and saves the link (needs `OPENROUTER_API_KEY`)                   |
| `?help`                    | Shows the command reference                                                |
| `?<question>`              | Searches bookmarks (semantic when AI is on, keyword otherwise)             |
| `?#tag`                    | Filters by tag                                                             |
| `?recent` / `?recent 10`   | Shows the last N bookmarks (default 5, max 20)                             |
| `?shop`                    | Lists shop categories with counts as a numbered menu (valid for 5 minutes) |
| `?shop watches`            | Lists products in a category with direct links                             |
| `1`, `2`, ... or `watches` | After `?shop`, opens a category by number or name                          |
| Quoted reply to the menu   | Long-press the menu, reply, and type a number or category                  |

## API

All endpoints except `/health` and `/api/login` need auth: the httpOnly session cookie, or `Authorization: Bearer <APP_PASSWORD>`.

**Auth and health**

- `GET /health` health check
- `POST /api/login` log in (sets the session cookie)
- `POST /api/logout` log out (clears the session cookie)

**WhatsApp**

- `GET /api/whatsapp/qr` QR code for linking
- `GET /api/whatsapp/status` connection status
- `POST /api/whatsapp/disconnect` disconnect the session
- `POST /api/whatsapp/reconnect` reconnect

**Bookmarks**

- `GET /api/bookmarks` list (query: `search`, `tag`, `domain`, `collection`, `archived`, `limit`, `offset`)
- `GET /api/bookmarks/:id` get one
- `POST /api/bookmarks` create
- `PATCH /api/bookmarks/:id` update
- `DELETE /api/bookmarks/:id` delete
- `POST /api/bookmarks/:id/refresh-metadata` re-fetch title, description and image
- `POST /api/bookmarks/bulk` bulk action (`{ ids, action: "archive" | "unarchive" | "delete" | "addTags", tags? }`)
- `GET /api/bookmarks/tags` all tags with counts
- `GET /api/bookmarks/shop` shop collection grouped by category (`{ groups: [{ category, items, count }], total }`)
- `GET /api/bookmarks/export` download all bookmarks as JSON (`?archived=true` to include archived)
- `POST /api/bookmarks/import` import a browser bookmarks HTML export (multipart field `file`)
- `GET /api/bookmarks/import/status` import progress and AI enrichment stats
- `DELETE /api/bookmarks/import/status` clear import status
- `POST /api/bookmarks/retry-ai` re-queue failed AI summaries / tags
- `POST /api/bookmarks/retry-embeddings` re-queue failed embeddings

**Settings**

- `GET /api/settings` current settings
- `PATCH /api/settings` update (`waAllowedGroupJid`, `digestEnabled`, `digestHour`)
- `GET /api/settings/whatsapp-groups` groups the linked account belongs to
- `POST /api/settings/whatsapp-groups/refresh` refresh that list from WhatsApp

## Project structure

```
what-the-link/
├── apps/
│   ├── web/              # TanStack Start frontend
│   └── server/           # Hono API + WhatsApp (Baileys)
├── packages/
│   ├── db/               # Drizzle schema + migrations
│   ├── env/              # Env validation (Zod)
│   ├── types/            # Shared TypeScript types
│   └── ui/               # Shared UI components
├── Dockerfile
├── docker-compose.yml
├── how-to-deploy.md      # Full deployment guide
├── knowledge.md          # Architecture deep-dive
└── .env.example
```

## Scripts

- `npm run dev` runs web + server
- `npm run dev:web` / `npm run dev:server` runs one app
- `npm run build` builds everything
- `npm run check-types` type-checks all workspaces
- `npm run db:push` pushes the schema
- `npm run db:generate` generates migrations
- `npm run db:migrate` runs migrations
- `npm run db:studio` opens Drizzle Studio

## License

MIT
