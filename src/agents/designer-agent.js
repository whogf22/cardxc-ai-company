// Designer Agent — generates logos, hero images, social graphics
import { BaseAgent } from './base-agent.js';
import axios from 'axios';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { logger } from '../utils/logger.js';

export class DesignerAgent extends BaseAgent {
  constructor(opts) {
    super({ ...opts, name: 'Designer', role: 'design' });
    this.outDir = resolve(process.cwd(), 'data', 'designs');
    try { mkdirSync(this.outDir, { recursive: true }); } catch {}
  }

  systemPrompt() {
    return `You are the Senior Brand Designer at CardXC.
Brand: fintech, premium, trust-focused, modern gradient aesthetic.
Colors: deep blue (#0A1F44), electric teal (#00D4FF), white, subtle gold accents.
When given a design task, return a JSON prompt plan:
{ "kind": "logo|hero|social|banner", "prompt": "detailed image prompt", "aspect": "1:1|16:9|9:16", "variants": 1 }`;
  }

  async execute(task, ctx = {}) {
    await this.report(`Designing: ${task}`);

    // Step 1: turn task into a good image prompt
    const plan = await this.thinkJSON({
      task: `Design task: ${task}. Return the prompt plan.`,
      taskType: 'fast'
    });

    // Step 2: generate image(s)
    const urls = [];
    const variants = Math.min(plan.variants || 1, 4);
    for (let i = 0; i < variants; i++) {
      try {
        const img = await this.visual.generateImage({
          prompt: plan.prompt,
          aspectRatio: plan.aspect || '16:9'
        });
        urls.push(img.url);
        await this.saveLocal(img.url, `${Date.now()}-${i}.webp`);
      } catch (e) {
        logger.warn(`Image ${i} failed: ${e.message}`);
      }
    }

    if (urls.length === 0) {
      await this.report(`❌ Design generation failed`);
      return { status: 'failed' };
    }

    // Send each to telegram
    for (const url of urls) {
      await this.telegram.sendPhoto(url, `🎨 ${task}`);
    }
    return { status: 'done', urls, prompt: plan.prompt };
  }

  async saveLocal(url, name) {
    try {
      const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
      writeFileSync(resolve(this.outDir, name), Buffer.from(res.data));
    } catch {}
  }
}
