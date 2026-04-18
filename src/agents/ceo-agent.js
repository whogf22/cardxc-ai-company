// CEO Agent — the orchestrator. Takes user requests, breaks them into tasks,
// delegates to the right agent, tracks progress.
import { BaseAgent } from './base-agent.js';
import { logger } from '../utils/logger.js';

export class CEOAgent extends BaseAgent {
  constructor(opts) {
    super({ ...opts, name: 'CEO', role: 'ceo' });
    this.team = opts.team; // { developer, designer, marketing, devops, qa, competitor }
    this.projects = new Map();
  }

  systemPrompt() {
    return `You are the CEO of CardXC AI Company — a fully autonomous AI team running the fintech platform cardxc.online.

Your team:
- 💻 Developer: writes & fixes code, handles Git/deploy
- 🎨 Designer: creates logos, hero images, marketing visuals, landing page mockups
- 📢 Marketing: writes blog posts, SEO content, social captions, competitor analysis
- 🛠️ DevOps: monitors uptime, manages VPS, handles security & deploys
- ✅ QA: tests features, finds bugs
- 🕵️ Competitor Watcher: tracks fintech competitors (Wise, Revolut, Payoneer, smspool competitors for virtual cards)

Your job: take the founder's (Siyam's) request, plan it, and delegate.
Be DIRECT. Use Bengali/English mix if founder does.

Always respond in this JSON format:
{
  "understanding": "one-line summary of what founder wants",
  "plan": [
    { "agent": "developer|designer|marketing|devops|qa|competitor", "task": "specific action", "priority": 1 }
  ],
  "risks": ["any concerns"],
  "estimated_time": "realistic time estimate",
  "requires_approval": false
}`;
  }

  async handleRequest(userMessage) {
    const projectId = `p_${Date.now()}`;
    logger.info(`🎯 CEO received: "${userMessage.slice(0, 100)}..."`);

    await this.report(`Got it. Planning: _${userMessage.slice(0, 100)}_`);

    let plan;
    try {
      plan = await this.thinkJSON({ task: userMessage, taskType: 'brain' });
    } catch (e) {
      await this.report(`⚠️ Planning failed: ${e.message}`);
      return;
    }

    this.projects.set(projectId, {
      id: projectId, request: userMessage, plan, status: 'running',
      startedAt: new Date().toISOString(), tasks: []
    });

    await this.report(
      `📋 *Plan*\n_${plan.understanding}_\n\n` +
      plan.plan.map((t, i) => `${i + 1}. ${t.agent}: ${t.task}`).join('\n') +
      `\n\n⏱️ ETA: ${plan.estimated_time}`
    );

    if (plan.requires_approval) {
      await this.report(`⚠️ This needs your approval before I proceed. Reply /approve ${projectId}`);
      return projectId;
    }

    // Execute plan sequentially (parallel would be nicer but riskier)
    for (const step of plan.plan.sort((a, b) => a.priority - b.priority)) {
      const agent = this.team[step.agent];
      if (!agent) {
        await this.report(`❌ No agent named "${step.agent}" — skipping`);
        continue;
      }
      try {
        const result = await agent.execute(step.task, { projectId });
        this.projects.get(projectId).tasks.push({ ...step, result, status: 'done' });
      } catch (e) {
        await this.report(`❌ ${step.agent} failed: ${e.message}`);
        this.projects.get(projectId).tasks.push({ ...step, error: e.message, status: 'failed' });
      }
    }

    this.projects.get(projectId).status = 'completed';
    await this.report(`✅ *Project ${projectId} done.*\nAsk me /status ${projectId} for details.`);
    return projectId;
  }

  async getStatus(projectId) {
    const p = this.projects.get(projectId);
    if (!p) return `Project ${projectId} not found.`;
    return `Project ${projectId}\n` +
           `Status: ${p.status}\n` +
           `Request: ${p.request}\n\n` +
           p.tasks.map(t => `${t.status === 'done' ? '✅' : '❌'} ${t.agent}: ${t.task}`).join('\n');
  }
}
