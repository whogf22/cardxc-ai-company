// DevOps Agent — monitors, deploys, handles infrastructure
import { BaseAgent } from './base-agent.js';
import axios from 'axios';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { logger } from '../utils/logger.js';

export class DevOpsAgent extends BaseAgent {
  constructor(opts) {
    super({ ...opts, name: 'DevOps', role: 'devops' });
    this.siteUrl = process.env.SITE_URL;
    this.siteName = process.env.SITE_NAME;
    this.repoPath = process.env.SITE_LOCAL_PATH;
    this.lastState = 'unknown';
  }

  systemPrompt() {
    return `You are the DevOps Engineer at CardXC.
Stack: Hostinger VPS, pm2, nginx, Let's Encrypt SSL, GitHub, Cloudflare DNS.
When given an ops task, analyze and provide exact commands or a JSON action plan.`;
  }

  async execute(task, ctx = {}) {
    await this.report(`Handling: ${task}`);
    // Route common ops commands directly
    if (/restart|reload/i.test(task)) return this.restartService();
    if (/check|status|uptime/i.test(task)) return this.checkHealth();
    if (/deploy/i.test(task)) return this.runDeploy();
    if (/log|error/i.test(task)) return this.pullLogs();

    // Else — ask model for plan
    const plan = await this.think({ task, taskType: 'coder' });
    await this.report(`Plan:\n\`\`\`\n${plan.slice(0, 1000)}\n\`\`\``);
    return { status: 'analyzed', plan };
  }

  async checkHealth() {
    const endpoints = ['/', '/api/health'];
    const results = [];
    for (const ep of endpoints) {
      const url = new URL(ep, this.siteUrl).toString();
      const start = Date.now();
      try {
        const res = await axios.get(url, { timeout: 10000, validateStatus: () => true });
        results.push({ url, status: res.status, ms: Date.now() - start });
      } catch (e) {
        results.push({ url, error: e.code || e.message });
      }
    }
    const allGood = results.every(r => r.status && r.status < 400);
    const state = allGood ? 'up' : 'down';
    if (this.lastState === 'down' && state === 'up') {
      await this.report(`✅ *${this.siteName}* recovered`);
    }
    this.lastState = state;

    const msg = results.map(r => r.error
      ? `❌ ${r.url}: ${r.error}`
      : `${r.status < 400 ? '✅' : '❌'} ${r.url} — ${r.status} (${r.ms}ms)`
    ).join('\n');
    await this.report(`Health check:\n${msg}`);
    return { status: allGood ? 'healthy' : 'unhealthy', results };
  }

  async restartService() {
    try {
      execSync(`pm2 restart ${this.siteName} || pm2 restart all`, { timeout: 60000, stdio: 'pipe' });
      await this.report(`🔄 Restarted ${this.siteName}`);
      return { status: 'restarted' };
    } catch (e) {
      await this.report(`❌ Restart failed: ${e.message}`);
      return { status: 'failed', error: e.message };
    }
  }

  async runDeploy() {
    if (!this.repoPath || !existsSync(this.repoPath)) {
      await this.report(`❌ Repo not found at ${this.repoPath}`);
      return { status: 'no_repo' };
    }
    try {
      execSync('git pull', { cwd: this.repoPath, timeout: 60000, stdio: 'pipe' });
      execSync(process.env.SITE_DEPLOY_CMD, { cwd: this.repoPath, timeout: 300000, stdio: 'pipe' });
      await this.report(`🚀 Deployed ${this.siteName}`);
      return { status: 'deployed' };
    } catch (e) {
      await this.report(`❌ Deploy failed: ${e.message.slice(0, 200)}`);
      return { status: 'failed' };
    }
  }

  async pullLogs() {
    try {
      const logs = execSync(`pm2 logs --nostream --lines 50 --err 2>/dev/null || true`,
        { encoding: 'utf8', timeout: 10000 });
      const errors = logs.split('\n').filter(l => /error|exception|ECONNREFUSED/i.test(l)).slice(0, 20);
      if (errors.length === 0) {
        await this.report(`✅ No recent errors in logs`);
      } else {
        await this.report(`⚠️ Recent errors:\n\`\`\`\n${errors.join('\n').slice(0, 2000)}\n\`\`\``);
      }
      return { status: 'done', errorCount: errors.length };
    } catch (e) {
      return { status: 'failed', error: e.message };
    }
  }
}
