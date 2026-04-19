#!/usr/bin/env bash
# print-secrets.sh — Re-generate .deploy-secrets.txt and print values.
# Safe to re-run. Idempotent.
set -euo pipefail

APP_DIR="/var/www/cardxc-ai-company"
KEY_PATH="$HOME/.ssh/cardxc_deploy"
CUR_USER="$(whoami)"

# ─── Ensure SSH key ────────────────────────────────
if [ ! -f "$KEY_PATH" ]; then
  mkdir -p ~/.ssh && chmod 700 ~/.ssh
  ssh-keygen -t ed25519 -C "cardxc-github-actions" -f "$KEY_PATH" -N "" >/dev/null
  touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys
  grep -qF "$(cat "$KEY_PATH.pub")" ~/.ssh/authorized_keys || cat "$KEY_PATH.pub" >> ~/.ssh/authorized_keys
fi

# ─── Detect public IP (multiple fallbacks) ─────────
DETECTED_IP=""
for src in "https://api.ipify.org" "https://ifconfig.me" "https://icanhazip.com" "https://checkip.amazonaws.com"; do
  DETECTED_IP=$(curl -s4 --max-time 5 "$src" 2>/dev/null | tr -d '\n[:space:]' || true)
  [ -n "$DETECTED_IP" ] && break
done
[ -z "$DETECTED_IP" ] && DETECTED_IP=$(hostname -I | awk '{print $1}')

# ─── Webhook secret ────────────────────────────────
cd "$APP_DIR"
WEBHOOK_SECRET=$(grep '^GITHUB_WEBHOOK_SECRET=' .env 2>/dev/null | cut -d= -f2 || true)
if [ -z "$WEBHOOK_SECRET" ]; then
  WEBHOOK_SECRET=$(openssl rand -hex 32)
  if grep -q '^GITHUB_WEBHOOK_SECRET=' .env 2>/dev/null; then
    sed -i "s|^GITHUB_WEBHOOK_SECRET=.*|GITHUB_WEBHOOK_SECRET=$WEBHOOK_SECRET|" .env
  else
    echo "GITHUB_WEBHOOK_SECRET=$WEBHOOK_SECRET" >> .env
  fi
fi

PRIVATE_KEY=$(cat "$KEY_PATH")

# ─── Write file ────────────────────────────────────
SECRETS_FILE="$APP_DIR/.deploy-secrets.txt"
{
  echo "# Generated on $(date)"
  echo "# Copy these into GitHub Secrets:"
  echo "# https://github.com/whogf22/cardxc-ai-company/settings/secrets/actions"
  echo ""
  echo "VPS_HOST=$DETECTED_IP"
  echo "VPS_USER=$CUR_USER"
  echo "VPS_PORT=22"
  echo "APP_DIR=$APP_DIR"
  echo ""
  echo "--- VPS_SSH_KEY (paste entire block including BEGIN/END lines) ---"
  echo "$PRIVATE_KEY"
  echo "--- end VPS_SSH_KEY ---"
  echo ""
  echo "GITHUB_WEBHOOK_SECRET=$WEBHOOK_SECRET"
  echo "WEBHOOK_URL=http://$DETECTED_IP:3002/hook"
} > "$SECRETS_FILE"
chmod 600 "$SECRETS_FILE"

# ─── Print ─────────────────────────────────────────
BOLD="\033[1m"; GREEN="\033[32m"; CYAN="\033[36m"; YELLOW="\033[33m"; NC="\033[0m"
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}${BOLD}  COPY THESE INTO GITHUB SECRETS${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}https://github.com/whogf22/cardxc-ai-company/settings/secrets/actions${NC}"
echo ""
echo -e "${BOLD}VPS_HOST${NC}"
echo "$DETECTED_IP"
echo ""
echo -e "${BOLD}VPS_USER${NC}"
echo "$CUR_USER"
echo ""
echo -e "${BOLD}VPS_PORT${NC}"
echo "22"
echo ""
echo -e "${BOLD}APP_DIR${NC}"
echo "$APP_DIR"
echo ""
echo -e "${BOLD}VPS_SSH_KEY${NC} (paste entire block)"
echo "$PRIVATE_KEY"
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}GITHUB WEBHOOK${NC} https://github.com/whogf22/cardxc-ai-company/settings/hooks/new"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "  Payload URL:  http://$DETECTED_IP:3002/hook"
echo "  Content type: application/json"
echo "  Secret:       $WEBHOOK_SECRET"
echo "  Events:       Just the push event"
echo ""
echo -e "${CYAN}All values also saved to:${NC} $SECRETS_FILE"
echo ""
