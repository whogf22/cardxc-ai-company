// src/index.js — CardXC AI Company main entry
// - Loads env
// - Starts Telegram listener
// - Starts cron jobs (competitor, monitor, daily report)
// - Exposes dashboard on port 3001
import 'dotenv/config';
import cron from 'node-cron';
import { logger } from './utils/logger.js';
import { TelegramService } from './integrations/telegram.js';
import { CEOAgent } from './agents/ceo-agent.js';
import { DeveloperAgent } from './agents/developer-agent.js';
import { DesignerAgent } from './agents/designer-agent.js';
import { MarketingAgent } from './agents/marketing-agent.js';
import { DevOpsAgent } from './agents/devops-agent.js';
import { QAAgent } from './agents/qa-agent.js';
import { CompetitorAgent } from './agents/competitor-agent.js';
import { startDashboard } from '../dashboard/server.js';

const log = logger.child('main');

async function main() {
  log.success('🚀 CardXC AI Company starting…');
  log.info('Environment', {
    node: process.version,
    env: process.env.NODE_ENV || 'development',
  });

  // Telegram — command + notify channel
  const tg = new TelegramService(
    process.env.TELEGRAM_BOT_TOKEN,
    process.env.TELEGRAM_CHAT_ID
  );

  // Instantiate the team
  const ceo = new CEOAgent({ telegram: tg });
  const dev = new DeveloperAgent({ telegram: tg });
  const designer = new DesignerAgent({ telegram: tg });
  const marketing = new MarketingAgent({ telegram: tg });
  const devops = new DevOpsAgent({ telegram: tg });
  const qa = new QAAgent({ telegram: tg });
  const competitor = new CompetitorAgent({ telegram: tg });

  const team = { ceo, dev, designer, marketing, devops, qa, competitor };
  if (ceo.setTeam) ceo.setTeam(team);

  // ─── Telegram command handler ────────────────────────────────
  tg.onMessage(async (text) => {
    const cmd = text.toLowerCase().trim();

    if (cmd === '/start' || cmd === '/help') {
      await tg.send(
        `*CardXC AI Company — Commands*\n\n` +
          `/status — team status\n` +
          `/scan — run competitor scan now\n` +
          `/deploy — trigger deploy\n` +
          `/report — daily summary\n` +
          `/agents — list agents\n\n` +
          `Or send any instruction in plain text — CEO will route it.`
      );
      return;
    }
    if (cmd === '/status') {
      await tg.send(`✅ Online • ${Object.keys(team).length} agents ready`);
      return;
    }
    if (cmd === '/agents') {
      await tg.send(
        `*Agents*\n` +
          Object.keys(team).map((k) => `• ${k}`).join('\n')
      );
      return;
    }
    if (cmd === '/scan') {
      await tg.send('🔍 Running competitor scan…');
      try {
        const out = await competitor.run();
        await tg.notify('Competitor scan complete', out?.summary || 'done');
      } catch (e) {
        await tg.send(`❌ Scan failed: ${e.message}`);
      }
      return;
    }
    if (cmd === '/deploy') {
      await tg.send('🚀 Triggering deploy…');
      try {
        const out = await devops.run({ action: 'deploy' });
        await tg.notify('Deploy', out?.summary || 'done');
      } catch (e) {
        await tg.send(`❌ Deploy failed: ${e.message}`);
      }
      return;
    }
    if (cmd === '/report') {
      await tg.send('📊 Generating daily report…');
      try {
        const out = await ceo.run({ action: 'daily_report' });
        await tg.notify('Daily Report', out?.summary || 'no data');
      } catch (e) {
        await tg.send(`❌ Report failed: ${e.message}`);
      }
      return;
    }

    // Default — route through CEO
    try {
      await tg.send('🤖 CEO is processing…');
      const out = await ceo.run({ instruction: text });
      await tg.notify('Result', out?.summary || JSON.stringify(out).slice(0, 1000));
    } catch (e) {
      log.error('CEO route failed', { error: e.message });
      await tg.send(`❌ ${e.message}`);
    }
  });

  // ─── Cron jobs ───────────────────────────────────────────────
  // Competitor scan — every 6 hours
  cron.schedule('0 */6 * * *', async () => {
    log.info('⏰ Cron: competitor scan');
    try {
      const out = await competitor.run();
      await tg.notify('Competitor (cron)', out?.summary || 'done');
    } catch (e) {
      log.error('Competitor cron failed', { error: e.message });
    }
  });

  // Health monitor — every 30 min
  cron.schedule('*/30 * * * *', async () => {
    log.debug('⏰ Cron: health check');
    try {
      await devops.run({ action: 'health_check' });
    } catch (e) {
      log.error('Health cron failed', { error: e.message });
    }
  });

  // Daily CEO report — 09:00 server time
  cron.schedule('0 9 * * *', async () => {
    log.info('⏰ Cron: daily report');
    try {
      const out = await ceo.run({ action: 'daily_report' });
      await tg.notify('🌅 Daily Report', out?.summary || 'no data');
    } catch (e) {
      log.error('Daily report cron failed', { error: e.message });
    }
  });

  // ─── Dashboard ───────────────────────────────────────────────
  try {
    await startDashboard({
      port: Number(process.env.DASHBOARD_PORT || 3001),
      team,
    });
    log.success(`📊 Dashboard: http://localhost:${process.env.DASHBOARD_PORT || 3001}`);
  } catch (e) {
    log.error('Dashboard failed to start', { error: e.message });
  }

  await tg.send('🟢 *CardXC AI Company online*\n\nSend /help to see commands.');
  log.success('✅ All systems ready');

  // Graceful shutdown
  process.on('SIGINT', async () => {
    log.warn('SIGINT — shutting down');
    await tg.send('🔴 Shutting down…');
    process.exit(0);
  });
  process.on('unhandledRejection', (err) => {
    log.error('Unhandled rejection', { error: String(err) });
  });
}

main().catch((e) => {
  logger.error('Fatal startup error', { error: e.message, stack: e.stack });
  process.exit(1);
});
