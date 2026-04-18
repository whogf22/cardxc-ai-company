// QA Agent — tests features, runs security checks
import { BaseAgent } from './base-agent.js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

export class QAAgent extends BaseAgent {
  constructor(opts) {
    super({ ...opts, name: 'QA', role: 'qa' });
  }

  systemPrompt() {
    return `You are the QA Engineer at CardXC.
You test features rigorously, find edge cases, and verify security.
When analyzing issues, be precise: exact step, expected vs actual.`;
  }

  async execute(task, ctx = {}) {
    await this.report(`Testing: ${task}`);
    if (/security|vuln|audit/i.test(task)) return this.securityScan();
    if (/seo|meta|content/i.test(task)) return this.seoAudit();
    if (/test|check/i.test(task)) return this.fullTest();
    return this.fullTest();
  }

  async fullTest() {
    const report = [];
    // 1. HTTP check
    try {
      const r = await axios.get(process.env.SITE_URL, { timeout: 15000, validateStatus: () => true });
      report.push(`HTTP: ${r.status < 400 ? '✅' : '❌'} ${r.status}`);
      const $ = cheerio.load(r.data);
      report.push(`Title: ${$('title').text() ? '✅' : '❌'} "${$('title').text().slice(0, 50)}"`);
      report.push(`Meta desc: ${$('meta[name=description]').attr('content') ? '✅' : '❌'}`);
      report.push(`H1: ${$('h1').length > 0 ? '✅' : '❌'} (${$('h1').length} found)`);
      report.push(`SSL: ${process.env.SITE_URL.startsWith('https') ? '✅' : '❌'}`);
    } catch (e) {
      report.push(`HTTP: ❌ ${e.message}`);
    }
    await this.report(`QA Report:\n${report.join('\n')}`);
    return { status: 'done', checks: report };
  }

  async securityScan() {
    const issues = [];
    if (process.env.SITE_LOCAL_PATH && existsSync(process.env.SITE_LOCAL_PATH)) {
      try {
        const result = execSync('npm audit --json --audit-level=high', {
          cwd: process.env.SITE_LOCAL_PATH, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
        });
        const data = JSON.parse(result || '{}');
        const v = data.metadata?.vulnerabilities || {};
        if ((v.critical || 0) + (v.high || 0) > 0) {
          issues.push(`⚠️ ${v.critical || 0} critical, ${v.high || 0} high npm vulns`);
        }
      } catch (e) {
        try {
          const d = JSON.parse(e.stdout?.toString() || '{}');
          const v = d.metadata?.vulnerabilities || {};
          if ((v.critical || 0) + (v.high || 0) > 0) {
            issues.push(`⚠️ ${v.critical || 0} critical, ${v.high || 0} high npm vulns`);
          }
        } catch {}
      }
    }
    try {
      const r = await axios.get(process.env.SITE_URL, { timeout: 10000 });
      if (!r.headers['strict-transport-security']) issues.push('Missing HSTS header');
      if (!r.headers['x-content-type-options']) issues.push('Missing X-Content-Type-Options');
    } catch {}
    if (issues.length === 0) {
      await this.report(`✅ Security: all green`);
    } else {
      await this.report(`🔒 Security findings:\n${issues.map(i => '• ' + i).join('\n')}`);
    }
    return { status: 'done', issues };
  }

  async seoAudit() {
    const issues = [];
    try {
      const r = await axios.get(process.env.SITE_URL, { timeout: 15000 });
      const $ = cheerio.load(r.data);
      const title = $('title').text();
      if (!title || title.length < 30) issues.push(`Title too short (${title.length} chars)`);
      const desc = $('meta[name=description]').attr('content') || '';
      if (!desc || desc.length < 120) issues.push(`Meta description too short (${desc.length} chars)`);
      if ($('h1').length === 0) issues.push('No H1 tag');
      if ($('h1').length > 1) issues.push(`${$('h1').length} H1 tags (should be 1)`);
      const imgsNoAlt = $('img:not([alt])').length;
      if (imgsNoAlt > 0) issues.push(`${imgsNoAlt} images missing alt`);
      if (!$('link[rel=canonical]').attr('href')) issues.push('Missing canonical URL');
    } catch (e) {
      issues.push(`Fetch failed: ${e.message}`);
    }
    if (issues.length === 0) {
      await this.report(`✅ SEO: all green`);
    } else {
      await this.report(`🔍 SEO issues:\n${issues.map(i => '• ' + i).join('\n')}`);
    }
    return { status: 'done', issues };
  }
}
