// Competitor Watcher — tracks fintech competitors for CardXC
import { BaseAgent } from './base-agent.js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'node:crypto';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { firecrawl } from '../integrations/firecrawl.js';

const COMPETITORS = {
  moneyTransfer: ['https://wise.com', 'https://www.revolut.com', 'https://www.payoneer.com'],
  virtualCards:  ['https://privacy.com', 'https://www.revolut.com/virtual-cards'],
  giftCards:     ['https://www.raise.com', 'https://www.cardcash.com']
};

export class CompetitorAgent extends BaseAgent {
  constructor(opts) {
    super({ ...opts, name: 'Competitor Scout', role: 'competitor' });
    this.snapshotDir = resolve(process.cwd(), 'data', 'competitors');
    try { mkdirSync(this.snapshotDir, { recursive: true }); } catch {}
  }

  systemPrompt() {
    return `You are the Competitive Intelligence Lead at CardXC.
You track fintech competitors (Wise, Revolut, Payoneer, Privacy.com, Raise, CardCash).
You analyze changes strategically: what does this move mean? What should CardXC do?
Be concise. 2-3 sentences max per insight.`;
  }

  async execute(task, ctx = {}) {
    await this.report(`Scanning competitors...`);
    const allUrls = Object.values(COMPETITORS).flat();
    const findings = [];
    for (const url of allUrls) {
      try {
        const snap = await this.snapshot(url);
        const prev = this.loadPrev(url);
        if (prev) {
          const diff = this.diff(prev, snap);
          if (diff.significant) findings.push({ url, snap, diff });
        }
        this.savePrev(url, snap);
      } catch (e) {
        // silent
      }
    }

    if (findings.length === 0) {
      await this.report(`🕵️ No significant competitor changes detected`);
      return { status: 'done', findings: [] };
    }

    for (const f of findings) {
      const insight = await this.analyze(f);
      await this.report(
        `🕵️ *${new URL(f.url).hostname}* changed:\n` +
        this.summarizeDiff(f.diff) + `\n\n` +
        `🧠 Insight: ${insight}`
      );
    }
    return { status: 'done', findings: findings.length };
  }

  async snapshot(url) {
    // Prefer Firecrawl (handles JS-heavy SPAs like Wise/Revolut). Fallback to cheerio.
    let markdown = '', title = '', bodyText = '';
    const fc = await firecrawl.scrape(url, { formats: ['markdown'], onlyMainContent: true });
    if (fc?.markdown) {
      markdown = fc.markdown;
      title = fc.metadata?.title || '';
      bodyText = markdown;
    } else {
      const res = await axios.get(url, {
        timeout: 20000,
        headers: { 'User-Agent': 'Mozilla/5.0 CardXC-CompetitorWatch' },
        validateStatus: () => true
      });
      const $ = cheerio.load(res.data || '');
      bodyText = $('body').text();
      title = $('title').text().trim();
      markdown = bodyText;
    }

    // Heading extraction (markdown has '# ' prefixes; fallback to cheerio if needed)
    const h1s = [], h2s = [];
    for (const line of markdown.split('\n')) {
      const m1 = line.match(/^#\s+(.+)/);
      const m2 = line.match(/^##\s+(.+)/);
      if (m1 && h1s.length < 10) h1s.push(m1[1].trim());
      if (m2 && h2s.length < 15) h2s.push(m2[1].trim());
    }
    const prices = [...new Set(bodyText.match(/[$€£]\s?\d+(?:[.,]\d{1,2})?/g) || [])].slice(0, 20);

    return {
      url, fetchedAt: new Date().toISOString(),
      title, h1s, h2s, prices,
      source: fc?.markdown ? 'firecrawl' : 'cheerio',
      contentHash: crypto.createHash('md5').update(bodyText.slice(0, 50000)).digest('hex')
    };
  }

  diff(prev, curr) {
    return {
      significant:
        prev.title !== curr.title ||
        prev.contentHash !== curr.contentHash,
      titleChanged: prev.title !== curr.title,
      newH1s: curr.h1s.filter(h => !prev.h1s.includes(h)),
      newH2s: curr.h2s.filter(h => !prev.h2s.includes(h)),
      newPrices: curr.prices.filter(p => !prev.prices.includes(p)),
      removedPrices: prev.prices.filter(p => !curr.prices.includes(p))
    };
  }

  summarizeDiff(d) {
    const parts = [];
    if (d.titleChanged) parts.push(`Title changed`);
    if (d.newH1s.length) parts.push(`New H1: ${d.newH1s.slice(0, 2).map(h => `"${h}"`).join(', ')}`);
    if (d.newH2s.length) parts.push(`New sections: ${d.newH2s.slice(0, 3).join(' · ')}`);
    if (d.newPrices.length) parts.push(`New prices: ${d.newPrices.join(', ')}`);
    if (d.removedPrices.length) parts.push(`Removed prices: ${d.removedPrices.join(', ')}`);
    return parts.join('\n');
  }

  async analyze(finding) {
    try {
      return await this.think({
        task: `Competitor ${finding.url} changed. Diff: ${JSON.stringify(finding.diff).slice(0, 800)}. What does this mean for CardXC and what should we do?`,
        taskType: 'fast'
      });
    } catch { return '(analysis failed)'; }
  }

  loadPrev(url) {
    const f = resolve(this.snapshotDir, crypto.createHash('md5').update(url).digest('hex') + '.json');
    if (!existsSync(f)) return null;
    try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; }
  }

  savePrev(url, snap) {
    const f = resolve(this.snapshotDir, crypto.createHash('md5').update(url).digest('hex') + '.json');
    writeFileSync(f, JSON.stringify(snap, null, 2));
  }
}
