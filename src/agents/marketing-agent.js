// Marketing Agent — blog posts, SEO, social captions, ad copy
import { BaseAgent } from './base-agent.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export class MarketingAgent extends BaseAgent {
  constructor(opts) {
    super({ ...opts, name: 'Marketing', role: 'marketing' });
    this.outDir = resolve(process.cwd(), 'data', 'content');
    try { mkdirSync(this.outDir, { recursive: true }); } catch {}
  }

  systemPrompt() {
    return `You are the Head of Marketing at CardXC — a fintech platform.
Tone: professional but approachable, trust-building, results-focused.
Target audience: freelancers, small businesses, crypto users, international remitters, gift-givers.
Competitors: Wise, Revolut, Payoneer, PayPal, Skrill (money transfer); Amazon/Razer Gold (gift cards); Privacy.com (virtual cards).
Keywords: virtual card, send money internationally, buy gift cards online, multi-currency wallet, fintech.

When writing content, always include:
- Clear hook in first line
- Concrete benefits (not features)
- Call-to-action
- SEO keywords naturally`;
  }

  async execute(task, ctx = {}) {
    await this.report(`Writing: ${task}`);
    // Use bulk (cheap) model for volume content, brain for strategy
    const isStrategy = /strategy|plan|analyze|research/i.test(task);
    const content = await this.think({
      task,
      taskType: isStrategy ? 'brain' : 'bulk'
    });

    const filename = `${Date.now()}-${task.slice(0, 40).replace(/\W+/g, '-')}.md`;
    writeFileSync(resolve(this.outDir, filename), `# ${task}\n\n${content}\n`);

    await this.report(
      `📝 Content ready (${content.length} chars)\nSaved: \`data/content/${filename}\`\n\n` +
      `*Preview:*\n${content.slice(0, 400)}...`
    );
    return { status: 'done', filename, preview: content.slice(0, 200) };
  }

  async writeBlogPost(topic, keywords = []) {
    const prompt = `Write a 1200-word SEO-optimized blog post for cardxc.online.
Topic: ${topic}
Keywords to include: ${keywords.join(', ')}
Format: Markdown with H2/H3 headings, bullet lists, and a clear CTA at the end.`;
    return this.execute(prompt);
  }

  async writeSocialPost(platform, topic) {
    const limits = { twitter: 280, linkedin: 1300, instagram: 2200, facebook: 2000 };
    const limit = limits[platform.toLowerCase()] || 280;
    const prompt = `Write a ${platform} post (max ${limit} chars) about: ${topic}
Include relevant hashtags, hook, and CTA to cardxc.online.`;
    return this.execute(prompt);
  }
}
