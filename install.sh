#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────
#  What The Link — One-command installer for VPS / servers
#  Usage: curl -fsSL https://raw.githubusercontent.com/Kiranism/what-the-link/main/install.sh | bash
# ─────────────────────────────────────────────────────────

APP_DIR="$HOME/what-the-link"
REPO="https://github.com/Kiranism/what-the-link.git"
COMPOSE_FILE="docker-compose.yml"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info()  { printf "${CYAN}[INFO]${NC}  %s\n" "$1"; }
ok()    { printf "${GREEN}[OK]${NC}    %s\n" "$1"; }
warn()  { printf "${YELLOW}[WARN]${NC}  %s\n" "$1"; }
error() { printf "${RED}[ERROR]${NC} %s\n" "$1"; exit 1; }

# ── Step 1: Check / install Docker ────────────────────────
check_docker() {
  if command -v docker &>/dev/null; then
    ok "Docker is installed ($(docker --version | head -1))"
  else
    info "Docker not found. Installing..."
    curl -fsSL https://get.docker.com | sh
    sudo systemctl enable --now docker
    ok "Docker installed"
  fi

  # Ensure current user can run docker without sudo
  if ! docker info &>/dev/null; then
    info "Adding $USER to docker group..."
    sudo usermod -aG docker "$USER"
    warn "You may need to log out and back in for docker group to take effect."
    warn "Re-run this script after logging back in."
    exit 0
  fi

  # Check docker compose
  if docker compose version &>/dev/null; then
    ok "Docker Compose is available"
  else
    error "Docker Compose not found. Please install Docker Compose v2: https://docs.docker.com/compose/install/"
  fi
}

# ── Step 2: Clone or update the repo ──────────────────────
setup_repo() {
  if [ -d "$APP_DIR" ]; then
    info "Existing installation found at $APP_DIR"
    cd "$APP_DIR"
    info "Pulling latest changes..."
    git pull --ff-only || warn "Could not pull latest changes. Continuing with existing version."
  else
    info "Cloning repository..."
    git clone "$REPO" "$APP_DIR"
    cd "$APP_DIR"
    ok "Repository cloned to $APP_DIR"
  fi
}

# ── Step 3: Configure environment ─────────────────────────
configure_env() {
  if [ -f .env ]; then
    if grep -q "APP_PASSWORD" .env; then
      ok "Existing .env found with APP_PASSWORD set"
      return
    fi
  fi

  echo ""
  printf "${CYAN}╔══════════════════════════════════════════╗${NC}\n"
  printf "${CYAN}║   What The Link — Setup                  ║${NC}\n"
  printf "${CYAN}╚══════════════════════════════════════════╝${NC}\n"
  echo ""

  # Prompt for password
  while true; do
    printf "  Enter a password for the web UI: "
    read -r password
    if [ -z "$password" ]; then
      warn "Password cannot be empty. Try again."
    elif [ "$password" = "changeme" ]; then
      warn "'changeme' is not allowed. Pick something secure."
    elif [ ${#password} -lt 6 ]; then
      warn "Password must be at least 6 characters."
    else
      break
    fi
  done

  # Optional: port
  printf "  Port to run on [3000]: "
  read -r port
  port="${port:-3000}"

  # Write .env
  cat > .env <<EOF
APP_PASSWORD=$password
EOF

  # Update port in compose if not default
  if [ "$port" != "3000" ]; then
    sed -i.bak "s/\"3000:3000\"/\"$port:3000\"/" "$COMPOSE_FILE" && rm -f "${COMPOSE_FILE}.bak"
    info "App will be available on port $port"
  fi

  ok "Configuration saved to .env"
}

# ── Step 4: Create data directory ─────────────────────────
setup_data() {
  mkdir -p "$APP_DIR/data"
  ok "Data directory ready (./data)"
}

# ── Step 5: Build and start ───────────────────────────────
start_app() {
  info "Building and starting (this may take a few minutes on first run)..."
  docker compose up -d --build

  echo ""
  info "Waiting for app to start..."

  # Wait up to 30 seconds for health check
  for i in $(seq 1 30); do
    if curl -sf http://localhost:${port:-3000}/health >/dev/null 2>&1; then
      echo ""
      printf "${GREEN}╔══════════════════════════════════════════╗${NC}\n"
      printf "${GREEN}║   What The Link is running!              ║${NC}\n"
      printf "${GREEN}╚══════════════════════════════════════════╝${NC}\n"
      echo ""
      echo "  Open: http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo 'your-server-ip'):${port:-3000}"
      echo ""
      echo "  Next steps:"
      echo "    1. Open the URL above in your browser"
      echo "    2. Enter your password to log in"
      echo "    3. Go to Settings and scan the WhatsApp QR code"
      echo "    4. Send a link to your WhatsApp group"
      echo ""
      echo "  Useful commands:"
      echo "    cd $APP_DIR"
      echo "    docker compose logs -f        # View logs"
      echo "    docker compose restart        # Restart"
      echo "    docker compose down           # Stop"
      echo "    git pull && docker compose up -d --build  # Update"
      echo ""
      return
    fi
    sleep 1
  done

  warn "App started but health check didn't pass yet."
  echo "  Check logs with: cd $APP_DIR && docker compose logs -f"
}

# ── Main ──────────────────────────────────────────────────
main() {
  echo ""
  printf "${CYAN}  What The Link — Installer${NC}\n"
  printf "${CYAN}  Save WhatsApp links automatically${NC}\n"
  echo ""

  check_docker
  setup_repo
  configure_env
  setup_data
  start_app
}

main
