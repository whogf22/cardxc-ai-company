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
    await this.telegram.send(`${icon} *${this.name}*\n${message}`, opts);
  }
}
