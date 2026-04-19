#!/usr/bin/env bash
# CardXC AI Company — One-command VPS setup
# Usage (on your VPS):
#   curl -sSL https://raw.githubusercontent.com/whogf22/cardxc-ai-company/main/scripts/vps-setup.sh | bash
#
# What it does:
#   1. Generates SSH keypair for GitHub Actions deploy (~/.ssh/cardxc_deploy)
#   2. Adds public key to ~/.ssh/authorized_keys
#   3. Installs Node.js 20, pm2, git (if missing)
#   4. Clones repo into /var/www/cardxc-ai-company
#   5. Starts pm2 processes (webhook + main app)
#   6. Prints VPS_HOST / VPS_USER / VPS_SSH_KEY / VPS_PORT for GitHub Secrets
#
# Re-running is safe (idempotent).

set -euo pipefail

# ─── Colors ──────────────────────────────────────────────────
BOLD="\033[1m"; GREEN="\033[32m"; YELLOW="\033[33m"; CYAN="\033[36m"; RED="\033[31m"; DIM="\033[2m"; NC="\033[0m"

banner() {
  echo ""
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}  CardXC AI Company — VPS Auto-Setup${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
}
step()  { echo -e "${CYAN}▸${NC} $1"; }
ok()    { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC}  $1"; }
fail()  { echo -e "${RED}✗${NC} $1"; exit 1; }

banner

# ─── Preconditions ───────────────────────────────────────────
command -v bash >/dev/null || fail "bash required"
REPO_URL="https://github.com/whogf22/cardxc-ai-company.git"
APP_DIR="/var/www/cardxc-ai-company"
CUR_USER="$(whoami)"
SUDO=""
if [ "$CUR_USER" != "root" ]; then
  if command -v sudo >/dev/null 2>&1; then SUDO="sudo"; else
    warn "Not root and sudo not found — some steps may fail"
  fi
fi

# ─── 1. Update apt ───────────────────────────────────────────
step "Updating apt cache"
$SUDO apt-get update -qq >/dev/null 2>&1 || warn "apt update failed (continuing)"

# ─── 2. Install prerequisites ────────────────────────────────
step "Ensuring git, curl, openssh-server"
$SUDO apt-get install -y -qq git curl openssh-server openssl ufw >/dev/null 2>&1 || true
ok "Base tools present"

# ─── 3. Install Node.js 20 ───────────────────────────────────
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d'v' -f2 | cut -d'.' -f1)" -lt 20 ]; then
  step "Installing Node.js 20 LTS"
  curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO -E bash - >/dev/null 2>&1
  $SUDO apt-get install -y -qq nodejs >/dev/null 2>&1
fi
ok "Node $(node -v)"

# ─── 4. Install pm2 ──────────────────────────────────────────
if ! command -v pm2 >/dev/null 2>&1; then
  step "Installing pm2 globally"
  $SUDO npm install -g pm2 >/dev/null 2>&1
fi
ok "pm2 $(pm2 -v)"

# ─── 5. SSH key pair ─────────────────────────────────────────
mkdir -p ~/.ssh
chmod 700 ~/.ssh
KEY_PATH="$HOME/.ssh/cardxc_deploy"
if [ ! -f "$KEY_PATH" ]; then
  step "Generating SSH deploy keypair"
  ssh-keygen -t ed25519 -C "cardxc-github-actions" -f "$KEY_PATH" -N "" >/dev/null
fi
# Ensure public key in authorized_keys (no duplicate)
touch ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
PUB_KEY=$(cat "${KEY_PATH}.pub")
if ! grep -qF "$PUB_KEY" ~/.ssh/authorized_keys; then
  echo "$PUB_KEY" >> ~/.ssh/authorized_keys
fi
ok "SSH deploy key ready"

# ─── 6. Clone repo ───────────────────────────────────────────
$SUDO mkdir -p /var/www
$SUDO chown -R "$CUR_USER":"$CUR_USER" /var/www
if [ -d "$APP_DIR/.git" ]; then
  step "Repo already cloned — pulling latest"
  cd "$APP_DIR" && git fetch --all -q && git reset --hard origin/main -q
else
  step "Cloning $REPO_URL"
  git clone -q "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"
ok "Repo at $APP_DIR"

# ─── 7. .env ─────────────────────────────────────────────────
if [ ! -f .env ]; then
  cp .env.example .env
  warn ".env created from template — edit it: nano $APP_DIR/.env"
fi
mkdir -p data/logs data/memory
ok ".env present"

# ─── 8. Dependencies ─────────────────────────────────────────
step "Installing npm dependencies (this may take 1–2 min)"
npm install --silent 2>/dev/null || npm install
ok "Dependencies installed"

# ─── 9. pm2 ecosystem ────────────────────────────────────────
cat > ecosystem.config.cjs <<'ECOEOF'
module.exports = {
  apps: [
    {
      name: 'cardxc-ai',
      script: 'src/index.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G',
      env: { NODE_ENV: 'production' },
      error_file: 'data/logs/pm2-err.log',
      out_file:  'data/logs/pm2-out.log',
      time: true,
    },
    {
      name: 'cardxc-webhook',
      script: 'scripts/webhook-server.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      env: { NODE_ENV: 'production' },
      error_file: 'data/logs/webhook-err.log',
      out_file:  'data/logs/webhook-out.log',
      time: true,
    },
  ],
};
ECOEOF
ok "ecosystem.config.cjs written"

# ─── 10. Firewall ────────────────────────────────────────────
if command -v ufw >/dev/null 2>&1; then
  $SUDO ufw allow 22/tcp   >/dev/null 2>&1 || true
  $SUDO ufw allow 3001/tcp >/dev/null 2>&1 || true
  $SUDO ufw allow 3002/tcp >/dev/null 2>&1 || true
fi

# ─── 11. pm2 start ───────────────────────────────────────────
step "Starting pm2 processes"
pm2 startOrReload ecosystem.config.cjs 2>/dev/null || pm2 start ecosystem.config.cjs
pm2 save >/dev/null 2>&1 || true
# Auto-start on reboot
STARTUP_CMD=$(pm2 startup systemd -u "$CUR_USER" --hp "$HOME" 2>&1 | grep "sudo " | tail -1 || true)
if [ -n "$STARTUP_CMD" ]; then
  eval "$STARTUP_CMD" >/dev/null 2>&1 || true
fi
ok "pm2 running"

# ─── 12. Detect IP ───────────────────────────────────────────
DETECTED_IP=$(curl -s4 --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
WEBHOOK_SECRET=$(grep '^GITHUB_WEBHOOK_SECRET=' .env | cut -d= -f2)
if [ -z "$WEBHOOK_SECRET" ]; then
  WEBHOOK_SECRET=$(openssl rand -hex 32)
  sed -i "s|^GITHUB_WEBHOOK_SECRET=.*|GITHUB_WEBHOOK_SECRET=$WEBHOOK_SECRET|" .env
fi

# ─── 13. Print GitHub Secrets ────────────────────────────────
PRIVATE_KEY=$(cat "$KEY_PATH")

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}${BOLD}  ✅ VPS SETUP COMPLETE${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BOLD}Live URLs:${NC}"
echo -e "  Dashboard:   http://$DETECTED_IP:3001"
echo -e "  Webhook:     http://$DETECTED_IP:3002/hook"
echo -e "  Health:      curl http://$DETECTED_IP:3002/health"
echo ""
echo -e "${BOLD}${YELLOW}━━━ COPY THESE INTO GITHUB SECRETS ━━━${NC}"
echo -e "${DIM}https://github.com/whogf22/cardxc-ai-company/settings/secrets/actions${NC}"
echo ""
echo -e "${BOLD}VPS_HOST${NC}"
echo -e "${CYAN}$DETECTED_IP${NC}"
echo ""
echo -e "${BOLD}VPS_USER${NC}"
echo -e "${CYAN}$CUR_USER${NC}"
echo ""
echo -e "${BOLD}VPS_PORT${NC}"
echo -e "${CYAN}22${NC}"
echo ""
echo -e "${BOLD}APP_DIR${NC}"
echo -e "${CYAN}$APP_DIR${NC}"
echo ""
echo -e "${BOLD}VPS_SSH_KEY${NC} ${DIM}(paste the ENTIRE block including BEGIN/END lines)${NC}"
echo -e "${CYAN}$PRIVATE_KEY${NC}"
echo ""
echo -e "${BOLD}${YELLOW}━━━ GITHUB WEBHOOK ━━━${NC}"
echo -e "${DIM}https://github.com/whogf22/cardxc-ai-company/settings/hooks/new${NC}"
echo -e "  Payload URL:   http://$DETECTED_IP:3002/hook"
echo -e "  Content type:  application/json"
echo -e "  Secret:        ${CYAN}$WEBHOOK_SECRET${NC}"
echo -e "  Events:        Just the push event"
echo ""
echo -e "${BOLD}Next:${NC}"
echo -e "  1. Edit .env:    ${CYAN}nano $APP_DIR/.env${NC}"
echo -e "  2. Fill API keys (ANTHROPIC, GROQ, OPENAI, FIRECRAWL, TELEGRAM)"
echo -e "  3. Restart:      ${CYAN}pm2 restart all${NC}"
echo -e "  4. View logs:    ${CYAN}pm2 logs${NC}"
echo ""

# ─── 14. Save secrets to file (for re-reading) ───────────────
SECRETS_FILE="$APP_DIR/.deploy-secrets.txt"
{
  echo "# Generated by vps-setup.sh on $(date)"
  echo "# Copy these into GitHub Secrets:"
  echo "# https://github.com/whogf22/cardxc-ai-company/settings/secrets/actions"
  echo ""
  echo "VPS_HOST=$DETECTED_IP"
  echo "VPS_USER=$CUR_USER"
  echo "VPS_PORT=22"
  echo "APP_DIR=$APP_DIR"
  echo ""
  echo "VPS_SSH_KEY:"
  echo "$PRIVATE_KEY"
  echo ""
  echo "GITHUB_WEBHOOK_SECRET=$WEBHOOK_SECRET"
  echo "WEBHOOK_URL=http://$DETECTED_IP:3002/hook"
} > "$SECRETS_FILE"
chmod 600 "$SECRETS_FILE"
echo -e "${DIM}Secrets also saved to: $SECRETS_FILE${NC}"
echo ""
