#!/usr/bin/env bash
# CardXC AI Company — VPS installer with auto-deploy webhook
# Tested on Ubuntu 22.04 / Hostinger VPS
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  CardXC AI Company — Installer"
echo "  Dir: $APP_DIR"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ─── 1. Node.js 20 ─────────────────────────────
if ! command -v node &> /dev/null; then
  echo "→ Installing Node.js 20 LTS…"
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
NODE_V=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
[ "$NODE_V" -lt 20 ] && { echo "⚠️  Node >= 20 required"; exit 1; }
echo "✓ Node $(node -v)"

# ─── 2. pm2 ─────────────────────────────────────
if ! command -v pm2 &> /dev/null; then
  echo "→ Installing pm2…"
  sudo npm install -g pm2
fi
echo "✓ pm2 $(pm2 -v)"

# ─── 3. git ─────────────────────────────────────
if ! command -v git &> /dev/null; then
  sudo apt-get install -y git
fi

# ─── 4. Install deps ────────────────────────────
cd "$APP_DIR"
echo "→ Installing npm dependencies…"
npm install --production=false

# ─── 5. .env check ──────────────────────────────
if [ ! -f .env ]; then
  echo "⚠️  .env missing — copying .env.example"
  cp .env.example .env
  echo "   → Edit .env and fill in all keys before continuing."
  echo "   → Then re-run this script."
  exit 0
fi

mkdir -p data/logs data/memory

# ─── 6. ecosystem.config.cjs (both processes) ───
cat > ecosystem.config.cjs <<'EOF'
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
EOF
echo "✓ ecosystem.config.cjs written"

# ─── 7. Firewall — open dashboard + webhook ─────
if command -v ufw &> /dev/null; then
  sudo ufw allow 3001/tcp || true     # dashboard
  sudo ufw allow 3002/tcp || true     # webhook
fi

# ─── 8. Start pm2 ───────────────────────────────
echo "→ Starting pm2 processes…"
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd -u "$USER" --hp "$HOME" || true

VPS_IP=$(hostname -I | awk '{print $1}')

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ CardXC AI Company is running"
echo ""
echo "  Dashboard:   http://$VPS_IP:3001"
echo "  Webhook:     http://$VPS_IP:3002/hook"
echo "  Health:      curl http://$VPS_IP:3002/health"
echo ""
echo "  pm2 status"
echo "  pm2 logs cardxc-ai"
echo "  pm2 logs cardxc-webhook"
echo ""
echo "  NEXT — configure GitHub webhook:"
echo "  https://github.com/<owner>/<repo>/settings/hooks/new"
echo "    Payload URL:   http://$VPS_IP:3002/hook"
echo "    Content type:  application/json"
echo "    Secret:        (same as GITHUB_WEBHOOK_SECRET in .env)"
echo "    Events:        Just the push event"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
