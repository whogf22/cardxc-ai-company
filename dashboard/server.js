// dashboard/server.js — lightweight Express dashboard on port 3001
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../src/utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const log = logger.child('dashboard');

export async function startDashboard({ port = 3001, team = {} } = {}) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(express.static(path.join(__dirname, 'public')));

  // ─── API ─────────────────────────────────────────────────────
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, uptime: process.uptime(), ts: Date.now() });
  });

  app.get('/api/agents', (_req, res) => {
    res.json({
      agents: Object.entries(team).map(([key, agent]) => ({
        key,
        name: agent?.name || key,
        role: agent?.role || 'unknown',
        status: agent?.status || 'idle',
      })),
    });
  });

  app.get('/api/logs', (_req, res) => {
    try {
      const logDir = path.resolve(__dirname, '../data/logs');
      if (!fs.existsSync(logDir)) return res.json({ lines: [] });
      const files = fs.readdirSync(logDir).sort().reverse();
      if (!files.length) return res.json({ lines: [] });
      const latest = path.join(logDir, files[0]);
      const content = fs.readFileSync(latest, 'utf-8');
      const lines = content.trim().split('\n').slice(-200);
      res.json({ file: files[0], lines });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/run/:agent', async (req, res) => {
    const { agent } = req.params;
    const a = team[agent];
    if (!a) return res.status(404).json({ error: 'agent not found' });
    try {
      const out = await a.run(req.body || {});
      res.json({ ok: true, result: out });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  await new Promise((resolve) => app.listen(port, resolve));
  log.success(`Dashboard listening on :${port}`);
}
