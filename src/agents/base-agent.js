// Base agent — all specialized agents extend this
import { logger } from '../utils/logger.js';

export class BaseAgent {
  constructor({ name, role, router, visualRouter, telegram, memory }) {
    this.name = name;
    this.role = role;
    this.router = router;
    this.visual = visualRouter;
    this.telegram = telegram;
    this.memory = memory;
  }

  async think({ task, context = '', systemOverride = null, taskType = 'brain' }) {
    const system = systemOverride || this.systemPrompt();
    const userMsg = context ? `CONTEXT:\n${context}\n\nTASK:\n${task}` : task;
    const res = await this.router.complete({
      task: taskType,
      system,
      messages: [{ role: 'user', content: userMsg }],
      maxTokens: 3000
    });
    logger.info(`🤖 [${this.name}] responded via ${res.provider}`);
    return res.text;
  }

  async thinkJSON({ task, context = '', taskType = 'brain' }) {
    const text = await this.think({ task: task + '\n\nRespond with ONLY valid JSON, no prose.', context, taskType });
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`${this.name} did not return JSON`);
    return JSON.parse(match[0]);
  }

  systemPrompt() {
    return `You are ${this.name}, the ${this.role} at CardXC AI Company.
CardXC is a fintech platform (cardxc.online) offering money transfer, virtual cards, gift cards, multi-currency wallets.
Be direct, professional, action-oriented. No fluff.`;
  }

  async report(message, opts = {}) {
    const icon = { ceo: '🎯', dev: '💻', design: '🎨', marketing: '📢',
                   devops: '🛠️', qa: '✅', competitor: '🕵️', support: '🧑‍💼' }[this.role] || '🤖';
    if (!this.telegram) return;
    await this.telegram.send(`${icon} *${this.name}*\n${message}`, opts);
  }

  // Generic .run() — subclasses can override, default routes to .execute() or AI think
  async run(input = {}) {
    // Support both string input and object input
    if (typeof input === 'string') {
      return this.execute ? this.execute(input, {}) : { summary: await this.thinkSafe(input) };
    }
    const { action, task, instruction, ...ctx } = input;
    const workItem = task || instruction || action || 'status';

    if (this.execute) {
      try {
        const result = await this.execute(workItem, ctx);
        return { summary: this.summarize(result), ...result };
      } catch (e) {
        logger.error(`${this.name} execute failed`, { error: e.message });
        return { summary: `${this.name} error: ${e.message}`, error: e.message };
      }
    }

    // Fallback: use AI think
    const text = await this.thinkSafe(workItem);
    return { summary: text.slice(0, 500) };
  }

  async thinkSafe(task) {
    if (!this.router) {
      return `[${this.name}] ready but no AI router configured — set GROQ_API_KEY or ANTHROPIC_API_KEY in .env`;
    }
    try { return await this.think({ task }); }
    catch (e) { return `[${this.name}] AI call failed: ${e.message}`; }
  }

  summarize(result) {
    if (!result) return 'done';
    if (typeof result === 'string') return result.slice(0, 500);
    if (result.summary) return result.summary;
    if (result.status) return `${result.status}${result.findings !== undefined ? ` (${result.findings} findings)` : ''}`;
    return 'done';
  }
}
