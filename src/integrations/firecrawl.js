// Firecrawl — fast web scraping for competitor watch
// Free tier: 500 pages/mo. Docs: https://docs.firecrawl.dev
import axios from 'axios';
import { logger } from '../utils/logger.js';

const BASE = 'https://api.firecrawl.dev/v1';

export class Firecrawl {
  constructor() {
    this.key = process.env.FIRECRAWL_API_KEY;
    if (!this.key) logger.warn('⚠️ FIRECRAWL_API_KEY missing — competitor watch disabled');
  }

  headers() {
    return {
      Authorization: `Bearer ${this.key}`,
      'Content-Type': 'application/json'
    };
  }

  // Scrape a single URL — returns clean markdown
  async scrape(url, { onlyMainContent = true, formats = ['markdown'] } = {}) {
    if (!this.key) return null;
    try {
      const r = await axios.post(`${BASE}/scrape`,
        { url, formats, onlyMainContent },
        { headers: this.headers(), timeout: 60_000 }
      );
      return r.data?.data || null;
    } catch (e) {
      logger.warn(`Firecrawl scrape failed for ${url}: ${e.response?.status} ${e.message}`);
      return null;
    }
  }

  // Crawl a site (multi-page)
  async crawl(url, { limit = 10, maxDepth = 2 } = {}) {
    if (!this.key) return null;
    try {
      const start = await axios.post(`${BASE}/crawl`,
        { url, limit, maxDepth, scrapeOptions: { formats: ['markdown'], onlyMainContent: true } },
        { headers: this.headers(), timeout: 30_000 }
      );
      const jobId = start.data?.id;
      if (!jobId) return null;

      // Poll until done (max 2 min)
      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const s = await axios.get(`${BASE}/crawl/${jobId}`, { headers: this.headers() });
        if (s.data?.status === 'completed') return s.data?.data || [];
        if (s.data?.status === 'failed')    return null;
      }
      logger.warn(`Firecrawl crawl timeout: ${url}`);
      return null;
    } catch (e) {
      logger.warn(`Firecrawl crawl failed: ${e.message}`);
      return null;
    }
  }

  // Extract structured data via LLM prompt
  async extract(url, { schema, prompt }) {
    if (!this.key) return null;
    try {
      const r = await axios.post(`${BASE}/scrape`,
        {
          url,
          formats: ['json'],
          jsonOptions: { schema, prompt },
          onlyMainContent: true
        },
        { headers: this.headers(), timeout: 90_000 }
      );
      return r.data?.data?.json || null;
    } catch (e) {
      logger.warn(`Firecrawl extract failed: ${e.message}`);
      return null;
    }
  }
}

export const firecrawl = new Firecrawl();
