# CardXC AI Company — Full Setup Guide (Bangla+English)

---

## ⚡ ONE-COMMAND SETUP (Recommended)

SSH kor tor VPS e ebong **ei ek line run kor**:

```bash
curl -sSL https://raw.githubusercontent.com/whogf22/cardxc-ai-company/main/scripts/vps-setup.sh | bash
```

**Eita nije nije sob kore:**
- SSH keypair banay (`~/.ssh/cardxc_deploy`)
- Public key `authorized_keys` e add kore
- Node.js 20 + pm2 + git install kore
- Repo clone kore `/var/www/cardxc-ai-company` e
- pm2 te 2 process start kore (`cardxc-ai` + `cardxc-webhook`)
- Firewall port 3001, 3002 open kore
- Terminal e print kore: **VPS_HOST, VPS_USER, VPS_SSH_KEY, VPS_PORT**

**Tarpor tor kaj sudhu 3 ta:**

1. Printed values copy kore GitHub Secrets e paste kor: https://github.com/whogf22/cardxc-ai-company/settings/secrets/actions
2. `.env` e API keys fill kor: `nano /var/www/cardxc-ai-company/.env`
3. `pm2 restart all`

Done. Next `git push` theke auto-deploy chalu.

---

## Manual Setup (if you want step-by-step control)

Tor jonno step-by-step guide. Ei order e kor — skip korbi na.

---

## 1. GitHub repo already ready

**Repo:** https://github.com/whogf22/cardxc-ai-company (private)

Code push already done. Ekhon tor VPS ke oi repo theke auto-pull korte hobe.

---

## 2. VPS e clone kor

SSH kor VPS e (Hostinger e je user + password di6e):

```bash
ssh root@YOUR_VPS_IP    # ba tor username
cd /home
git clone https://github.com/whogf22/cardxc-ai-company.git
cd cardxc-ai-company
```

**Eita private repo** — git clone korte Personal Access Token lagbe. Token create kor:
- https://github.com/settings/tokens?type=beta
- **Token name:** cardxc-vps
- **Expiration:** 1 year
- **Repository access:** Only select → `cardxc-ai-company`
- **Permissions:** Contents = Read and write, Metadata = Read
- Generate → copy token → kothao save kor

Clone command:
```bash
git clone https://<TOKEN>@github.com/whogf22/cardxc-ai-company.git
```

Token `.env` e o rakh: `GITHUB_TOKEN=...`

---

## 3. .env configure kor VPS e

```bash
cd /home/cardxc-ai-company
cp .env.example .env
nano .env
```

**Minimum je gulo fill korbi:**

```env
ANTHROPIC_API_KEY=sk-ant-...        # agei ache
GROQ_API_KEY=gsk_...                # agei ache
OPENAI_API_KEY=sk-proj-...          # agei ache
FIRECRAWL_API_KEY=fc-...            # agei ache

TELEGRAM_BOT_TOKEN=<your-bot-token-from-BotFather>
TELEGRAM_CHAT_ID=<your-chat-id-from-@userinfobot>

GITHUB_TOKEN=<step 2 er token>
GITHUB_OWNER=whogf22
GITHUB_REPO=cardxc-ai-company

# Webhook — ekta random string banai, GitHub webhook er secret field eo eita e dibi
GITHUB_WEBHOOK_SECRET=<run: openssl rand -hex 32>

APP_DIR=/home/cardxc-ai-company
DEPLOY_BRANCH=main
```

**Webhook secret banate:**
```bash
openssl rand -hex 32
```
Output copy kore `GITHUB_WEBHOOK_SECRET=...` e rakh.

---

## 4. Install + run

```bash
chmod +x install.sh
./install.sh
```

Eita:
- Node 20 install kore
- pm2 install kore
- npm deps install kore
- 2 ta pm2 process start kore: `cardxc-ai` (main) + `cardxc-webhook` (port 3002)
- Firewall e port 3001 (dashboard) + 3002 (webhook) open kore
- Server reboot hole o auto-start hobe

Output er last line dekha: **Webhook URL** + **Dashboard URL** dekhabe.

---

## 5. GitHub webhook setup — THIS MAKES AUTO-DEPLOY WORK

Browser e ja:
```
https://github.com/whogf22/cardxc-ai-company/settings/hooks/new
```

Fill kor:
- **Payload URL:** `http://YOUR_VPS_IP:3002/hook`
- **Content type:** `application/json`
- **Secret:** (oi `GITHUB_WEBHOOK_SECRET` er value paste kor)
- **Which events:** "Just the push event"
- **Active:** ✓ checked

→ **Add webhook**

GitHub e ping pathabe — sathe sathe VPS er `cardxc-webhook` process er log check kor:
```bash
pm2 logs cardxc-webhook --lines 20
```

---

## 6. Test — ekta commit kore auto-deploy dekh

Local e (ba ei sandbox e):
```bash
cd /home/user/workspace/cardxc-ai-company
echo "# test" >> README.md
git add . && git commit -m "test auto-deploy"
git push origin main
```

10-15 sec er moddhe tor Telegram e 2 ta message ashbe:
1. 🚀 Auto-deploy `abc1234` — triggered
2. ✅ Live! `abc1234` deployed in production

Eita na ashle `pm2 logs cardxc-webhook` check kor.

---

## 7. GitHub Actions (backup path) — optional but recommended

Dui layer protection — Actions webhook fail korle o run korbe.

Repo e ja:
```
https://github.com/whogf22/cardxc-ai-company/settings/secrets/actions
```

Add these secrets:

| Name                 | Value                                    |
| -------------------- | ---------------------------------------- |
| `VPS_HOST`           | tor VPS er IP                            |
| `VPS_USER`           | `root` (ba tor SSH user)                 |
| `VPS_PORT`           | `22` (default)                           |
| `VPS_SSH_KEY`        | SSH private key (niche dekh)             |
| `APP_DIR`            | `/home/cardxc-ai-company`                |
| `TELEGRAM_BOT_TOKEN` | same value as .env                       |
| `TELEGRAM_CHAT_ID`   | `7582677649`                             |

**SSH key banate (VPS e):**
```bash
ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/gh_deploy -N ""
cat ~/.ssh/gh_deploy.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
cat ~/.ssh/gh_deploy         # <-- eita copy kore VPS_SSH_KEY secret e paste kor
```

---

## 8. Telegram bot test

Tor bot: [@whogf2_bot](https://t.me/whogf2_bot) (ba token je bot er)

Chat e ja → `/start` pathao → bot reply korbe.

Commands:
- `/help` — menu
- `/status` — online status
- `/agents` — list
- `/scan` — competitor scan
- `/deploy` — trigger deploy
- `/report` — daily report
- **Plain text** → CEO agent route korbe

---

## Monitoring

```bash
pm2 status                          # dekh 2 ta process running
pm2 logs cardxc-ai                  # main app
pm2 logs cardxc-webhook             # webhook
pm2 monit                           # real-time dashboard
tail -f data/logs/$(date +%F).log   # today's file log
```

**Dashboard:** http://YOUR_VPS_IP:3001

---

## Troubleshooting

**Webhook e ping aste na?**
- Firewall check: `sudo ufw status` → 3002 allow thaka dorkar
- `curl http://YOUR_VPS_IP:3002/health` — `{"ok":true}` return korbe

**Deploy fail?**
- `pm2 logs cardxc-webhook` dekh
- SSH e chheke: `cd /home/cardxc-ai-company && git pull && npm install && pm2 restart cardxc-ai`

**Telegram e nothing?**
- `TELEGRAM_CHAT_ID` thik ache? Chat_id check: @userinfobot e message pathaile jar number dibe oita

**GitHub push blocked?**
- PAT expired? Naya token banao step 2 theke

---

## Security checklist

- [ ] OpenAI te $20/mo hard limit set kora: https://platform.openai.com/account/limits
- [ ] GitHub PAT e only `cardxc-ai-company` repo scope (full repo na)
- [ ] `.env` kono shomoy git e commit na — `.gitignore` e ache ensure kor
- [ ] VPS e `ufw` enabled + only 22, 80, 443, 3001, 3002 open
- [ ] 90 din por api keys rotate

---

Done! Kono jhamela hole `pm2 logs` dekh — 90% issue oikhan e bola thake.
