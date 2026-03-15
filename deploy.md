# Deploy 𝙒𝞖𝞓𝞣 𝞣𝞖𝞢 𝙇𝞘𝞟𝞙¯\_(ツ)_/¯

Deploy on any VPS with Docker. Takes about 5 minutes.

## Requirements

- A VPS (Ubuntu/Debian recommended) with SSH access
- Docker and Docker Compose installed
- Port 3000 open (or 80/443 if using a domain)

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/Kiranism/what-the-link.git
cd bookmark

# 2. Set your password
echo 'APP_PASSWORD=your-secure-password' > .env

# 3. Build and run
docker compose up -d --build
```

Open `http://<your-server-ip>:3000` — done.

## Step by Step

### 1. Install Docker

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-v2
sudo systemctl enable docker
sudo usermod -aG docker $USER

# Relogin for group to take effect
exit
# SSH back in
```

### 2. Clone and configure

```bash
git clone https://github.com/Kiranism/what-the-link.git
cd bookmark

# Create .env with your password
echo 'APP_PASSWORD=your-secure-password' > .env
```

> The container will refuse to start if `APP_PASSWORD` is not set or is `changeme`.

### 3. Build and run

```bash
docker compose up -d --build
```

First build takes a few minutes. After that:

```bash
# Check status
docker compose ps

# View logs
docker compose logs -f

# Verify health
curl http://localhost:3000/health
```

### 4. Open the firewall

Make sure port 3000 is open:

```bash
# UFW (Ubuntu default)
sudo ufw allow 3000/tcp

# Or iptables (Oracle Cloud, etc.)
sudo iptables -I INPUT -p tcp --dport 3000 -j ACCEPT
sudo iptables-save | sudo tee /etc/iptables/rules.v4
```

> **Oracle Cloud users:** Also add an Ingress Rule in your VCN Security List for port 3000.

### 5. Open the app

Go to `http://<your-server-ip>:3000`, enter your password, and connect WhatsApp via Settings.

## Add a Domain (Optional)

### 1. Point DNS

Add an **A record** in your domain registrar:

| Type | Name | Value |
|------|------|-------|
| A | `@` or subdomain | Your server IP |

### 2. Install Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

### 3. Open ports 80 and 443

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Or iptables
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo iptables-save | sudo tee /etc/iptables/rules.v4
```

> **Oracle Cloud users:** Also add Ingress Rules for ports 80 and 443 in the Security List.

### 4. Configure Caddy

```bash
sudo bash -c 'echo "yourdomain.com {
    reverse_proxy localhost:3000
}" > /etc/caddy/Caddyfile'

sudo systemctl restart caddy
```

Replace `yourdomain.com` with your actual domain. Caddy auto-provisions HTTPS via Let's Encrypt.

Your app is now live at `https://yourdomain.com`.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `APP_PASSWORD` | Yes | — | Password for login and API |
| `DATABASE_URL` | No | `file:/data/bookmarks.db` | SQLite path (inside container) |
| `WA_AUTH_DIR` | No | `/data/whatsapp_auth` | WhatsApp session storage |
| `NODE_ENV` | No | `production` | Environment mode |
| `WA_ALLOWED_GROUP_JID` | No | — | Limit bookmarks to one WhatsApp group |

All can be set in `.env` or passed via `docker compose`:

```bash
APP_PASSWORD=secret WA_ALLOWED_GROUP_JID=12345@g.us docker compose up -d
```

## Common Commands

```bash
docker compose up -d --build   # Build and start
docker compose logs -f         # View logs
docker compose restart         # Restart
docker compose down            # Stop
docker compose pull && docker compose up -d --build  # Update after git pull
```

## Data & Backups

All data lives in a Docker volume (`app_data`) mounted at `/data`:
- `bookmarks.db` — your SQLite database
- `whatsapp_auth/` — WhatsApp session (avoid re-scanning QR)

### Option 1: Export via API (portable)

```bash
# JSON — includes all bookmark data, importable into any instance
curl -H "Authorization: Bearer YOUR_PASSWORD" \
  https://yourdomain.com/api/bookmarks/export?format=json \
  -o bookmarks-backup.json

# HTML — Netscape bookmark format, importable into any browser
curl -H "Authorization: Bearer YOUR_PASSWORD" \
  https://yourdomain.com/api/bookmarks/export?format=html \
  -o bookmarks-backup.html
```

To import JSON back into a new instance:

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_PASSWORD" \
  -H "Content-Type: application/json" \
  -d @bookmarks-backup.json \
  https://yourdomain.com/api/bookmarks/import
```

### Option 2: Copy raw SQLite file

```bash
# Backup
docker compose cp app:/data/bookmarks.db ./bookmarks.db

# Restore
docker compose cp ./bookmarks.db app:/data/bookmarks.db
docker compose restart
```

### Option 3: Migrate everything to a new server

This moves the database AND WhatsApp session — no need to re-scan QR.

```bash
# On OLD server — export everything
docker compose cp app:/data ./data-backup
scp -r ./data-backup user@new-server:~/

# On NEW server
git clone https://github.com/Kiranism/what-the-link.git
cd what-the-link
echo 'APP_PASSWORD=your-password' > .env
docker compose up -d --build
docker compose cp ~/data-backup/. app:/data/
docker compose restart
```

### Automated daily backup (cron)

```bash
# Add to crontab: crontab -e
0 3 * * * docker compose -f /path/to/what-the-link/docker-compose.yml cp app:/data/bookmarks.db /path/to/backups/bookmarks-$(date +\%Y\%m\%d).db
```

## Updating

```bash
cd bookmark
git pull
docker compose up -d --build
```

Your data persists across rebuilds — the volume is never deleted unless you explicitly run `docker compose down -v`.

## Troubleshooting

**Container exits immediately**
→ Check `docker compose logs`. Most likely `APP_PASSWORD` is not set.

**Can't access from browser**
→ Firewall issue. Check `sudo iptables -L -n` and cloud provider security rules.

**WhatsApp disconnects frequently**
→ Normal after restarts. Open Settings → scan QR again. Session persists after initial setup.

**Caddy SSL fails**
→ Ports 80/443 must be open. Check `sudo systemctl status caddy` for errors.

**Out of disk space**
→ Docker images can grow. Run `docker system prune -f` to clean up.
