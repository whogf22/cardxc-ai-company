#!/bin/bash
# CARDXC Emergency Security Rotation
# Run on VPS as: bash <(curl -sSL https://raw.githubusercontent.com/whogf22/cardxc-ai-company/main/rotate.sh)

set -e

echo "🔑 Step 1/8: Generating new SSH key..."
ssh-keygen -t ed25519 -f ~/.ssh/cardxc_deploy_v2 -N "" -C "cardxc-github-actions-v2"

echo "🔑 Step 2/8: Adding new key to authorized_keys..."
cat ~/.ssh/cardxc_deploy_v2.pub >> ~/.ssh/authorized_keys

echo "🗑️  Step 3/8: Removing OLD compromised key..."
sed -i '/cardxc-github-actions$/d' ~/.ssh/authorized_keys

echo "📤 Step 4/8: Uploading new key to GitHub Secret..."
gh secret set VPS_SSH_KEY --repo whogf22/cardxc-ai-company < ~/.ssh/cardxc_deploy_v2

echo "🔐 Step 5/8: Rotating webhook secret..."
NEW_WEBHOOK=$(openssl rand -hex 32)
echo "   New webhook secret: $NEW_WEBHOOK"
sed -i "s/^GITHUB_WEBHOOK_SECRET=.*/GITHUB_WEBHOOK_SECRET=$NEW_WEBHOOK/" /var/www/cardxc-ai-company/.env

echo "♻️  Step 6/8: Restarting webhook service..."
pm2 restart cardxc-webhook || echo "   (webhook not running — skipped)"

echo "🧹 Step 7/8: Purging leaked file from git history..."
cd /var/www/cardxc-ai-company
git filter-branch --force --index-filter "git rm --cached --ignore-unmatch .deploy-secrets.txt" --prune-empty --tag-name-filter cat -- --all 2>&1 | tail -5
git push origin --force --all

echo "🗑️  Step 8/8: Deleting old compromised local key..."
rm -f ~/.ssh/cardxc_deploy ~/.ssh/cardxc_deploy.pub

echo ""
echo "✅ SECURITY ROTATION COMPLETE"
echo ""
echo "Test kore dekho:"
echo "  cd /var/www/cardxc-ai-company"
echo "  echo \"post-rotate test \$(date)\" >> DEPLOY_LOG.md"
echo "  git add DEPLOY_LOG.md && git commit -m 'test' && git push"
echo ""
echo "1 min moddhe Telegram-e ✅ ashle new key perfect kaj korche."
