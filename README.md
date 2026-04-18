# CardXC AI Company

> Autonomous AI team running **cardxc.online**, **getotps.com**, **writtingexpert.com** 24/7.

An always-on multi-agent system that codes, designs, markets, deploys, monitors competitors, and reports to you via Telegram. CEO-led, 7 specialist agents, 37-specialist visual workflow.

---

## What it does

- **CEO Agent** — routes your instruction to the right team
- **Developer** — writes code, commits, opens PRs
- **Designer** — generates mockups + assets
- **Marketing** — writes content, posts to social, email
- **DevOps** — deploys + monitors health every 30 min
- **QA** — tests after every deploy
- **Competitor Watch** — scans Wise, Revolut, PayPal pricing every 6h via Firecrawl
- **Refinement Council** (visual workflow) — 10 critique/polish/fact-check/judge agents

Control everything from **Telegram** (commands + free text). Watch it live on the **Dashboard** (port 3001).

---

## Architecture

```
Telegram ⇄ CEO Agent ──→ [ dev | designer | marketing | devops | qa | competitor ]
            │                      │
            ├─ Model Router (Claude · Groq · OpenAI · Together · DeepInfra · OpenRouter)
            ├─ Firecrawl (JS-heavy scraping)
            ├─ Cron (competitor 6h · health 30m · daily report 9am)
            └─ Dashboard (express :3001)
```

### Model profiles

| Profile   | Primary          | Fallback         | Use case                   |
| --------- | ---------------- | ---------------- | -------------------------- |
| brain     | Claude Opus      | GPT-4o           | CEO decisions              |
| coder     | Claude Sonnet    | DeepSeek-Coder   | Code gen                   |
| fast      | Groq Llama 70B   | Together Llama   | Realtime chat, triage      |
| realtime  | Groq Llama 8B    | Groq Llama 70B   | Sub-second responses       |
| debate    | GPT-4o + Claude  | —                | 2-model cross-check        |
| bulk      | Together / DeepInfra | —            | Cheap batch work           |

---

## Prerequisites

- **VPS**: Ubuntu 22.04, 2+ GB RAM (Hostinger VPS works)
- **Node.js**: 20 LTS (installer handles it)
- **Telegram Bot**: create via [@BotFather](https://t.me/BotFather), get token + your chat ID
- **API keys** (at minimum):
  - `ANTHROPIC_API_KEY`
  - `GROQ_API_KEY`
  - `OPENAI_API_KEY`
  - `FIRECRAWL_API_KEY`
  - `GITHUB_TOKEN` (for auto-commits)

---

## Install (VPS)

```bash
# 1. Upload / clone
scp cardxc-ai-company-v1.tar.gz user@vps:/home/user/
ssh user@vps
tar -xzf cardxc-ai-company-v1.tar.gz
cd cardxc-ai-company

# 2. Configure
cp .env.example .env
nano .env      # fill in all keys

# 3. Install & run
chmod +x install.sh
./install.sh
```

The script installs Node 20, pm2, dependencies, and starts with auto-restart on reboot.

---

## Environment

Copy `.env.example` to `.env` and fill in:

```env
# ─── MUST SET ───
ANTHROPIC_API_KEY=sk-ant-...
GROQ_API_KEY=gsk_...
OPENAI_API_KEY=sk-proj-...
FIRECRAWL_API_KEY=fc-...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...

# ─── OPTIONAL (recommended) ───
OPENROUTER_API_KEY=sk-or-...
TOGETHER_API_KEY=...
DEEPINFRA_API_KEY=...
COHERE_API_KEY=...
GITHUB_TOKEN=ghp_...
VPS_HOST=your.vps.ip

# ─── SAFETY ───
REQUIRE_APPROVAL_FOR=deploy,delete,refund
DASHBOARD_PORT=3001
DEBUG=false
```

> ⚠️ **Security**: Set hard monthly spend limits on OpenAI (platform.openai.com/account/limits → $20/mo). Rotate keys if leaked.

---

## Telegram commands

| Command   | What it does                          |
| --------- | ------------------------------------- |
| `/help`   | Show menu                             |
| `/status` | Team online status                    |
| `/agents` | List available agents                 |
| `/scan`   | Run competitor scan now               |
| `/deploy` | Deploy latest code                    |
| `/report` | Generate CEO daily report             |

**Plain text** → routed through CEO, who picks the right agent.

---

## Dashboard

Browse to `http://<vps-ip>:3001` to see:

- Live agent roster + status dots
- Uptime + stats
- Log tail (last 80 lines, auto-refresh 5s)
- Run-agent button for manual triggers

---

## Visual Workflow

The 37-agent visual workflow (CEO + specialists + Refinement Council) is a separate React Flow webapp:

- 4-column layout: input → CEO → 37 agents → output
- Scenarios: refine, research, voice, largecode, async, longtask, fintech, realtime…
- Live scenario replay highlights the route based on your prompt

Deploy path: `/home/user/workspace/cardxc-workflow-visual/`

---

## Safety & approvals

- Anything listed in `REQUIRE_APPROVAL_FOR` pauses and asks via Telegram before running
- Git commits are always reversible
- Prod deploys require passing QA + CEO sign-off
- Rotate API keys every 90 days

---

## Troubleshooting

```bash
pm2 logs cardxc-ai          # live logs
pm2 restart cardxc-ai       # restart
pm2 stop cardxc-ai          # stop
tail -f data/logs/$(date +%F).log   # today's log file
```

If Telegram bot doesn't respond: verify `TELEGRAM_CHAT_ID` matches your personal chat (send your bot a message, check logs for chatId).

If Firecrawl rate-limits: the competitor agent falls back to cheerio automatically.

---

## License

Private — CARDXC LLC. Siyam Hasan.
