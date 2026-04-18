#!/usr/bin/env node
// scripts/webhook-server.js — lightweight GitHub webhook listener
// Triggers git pull + pm2 restart on push to main.
// Runs on VPS as a separate pm2 process on port 3002.
//
//   pm2 start scripts/webhook-server.js --name cardxc-webhook
//
// GitHub → Settings → Webhooks → Add:
//   Payload URL:   http://YOUR_VPS_IP:3002/hook
//   Content type:  application/json
//   Secret:        (match GITHUB_WEBHOOK_SECRET in .env)
//   Events:        Just the push event

import http from 'http';
import crypto from 'crypto';
import { exec } from 'child_process';
import 'dotenv/config';

const PORT = Number(process.env.WEBHOOK_PORT || 3002);
const SECRET = process.env.GITHUB_WEBHOOK_SECRET || '';
const APP_DIR = process.env.APP_DIR || process.cwd();
const BRANCH = process.env.DEPLOY_BRANCH || 'main';
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT = process.env.TELEGRAM_CHAT_ID;

function tg(text) {
  if (!TG_TOKEN || !TG_CHAT) return;
  const body = new URLSearchParams({
    chat_id: TG_CHAT,
    parse_mode: 'Markdown',
    text,
  }).toString();
  const opts = {
    hostname: 'api.telegram.org',
    path: `/bot${TG_TOKEN}/sendMessage`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': body.length,
    },
  };
  const req = require('https').request(opts);
  req.on('error', () => {});
  req.write(body);
  req.end();
}

function verify(req, raw) {
  if (!SECRET) return true; // no secret configured = accept
  const sig = req.headers['x-hub-signature-256'];
  if (!sig) return false;
  const hmac = crypto.createHmac('sha256', SECRET);
  hmac.update(raw);
  const expected = 'sha256=' + hmac.digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

function run(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { cwd: APP_DIR, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout, stderr: stderr || (err && err.message) });
    });
  });
}

async function deploy(payload) {
  const pusher = payload?.pusher?.name || 'unknown';
  const msg = payload?.head_commit?.message || '';
  const sha = (payload?.after || '').slice(0, 7);
  console.log(`[webhook] Deploy ${sha} by ${pusher}: ${msg}`);
  tg(`🚀 *Auto-deploy* \`${sha}\`\nby ${pusher}\n_${msg}_`);

  const steps = [
    ['git fetch --all', 'fetch'],
    [`git reset --hard origin/${BRANCH}`, 'reset'],
    ['npm install --production=false', 'npm install'],
    ['pm2 restart cardxc-ai || pm2 start ecosystem.config.cjs', 'restart'],
  ];
  for (const [cmd, name] of steps) {
    const r = await run(cmd);
    if (!r.ok) {
      console.error(`[${name}] FAIL:`, r.stderr);
      tg(`❌ *Deploy failed at ${name}*\n\`\`\`\n${(r.stderr || '').slice(0, 300)}\n\`\`\``);
      return;
    }
  }
  tg(`✅ *Live!* \`${sha}\` deployed in production`);
}

http
  .createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, uptime: process.uptime() }));
      return;
    }
    if (req.method !== 'POST' || req.url !== '/hook') {
      res.writeHead(404);
      res.end();
      return;
    }
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      if (!verify(req, raw)) {
        res.writeHead(401);
        res.end('bad signature');
        return;
      }
      const event = req.headers['x-github-event'];
      if (event !== 'push') {
        res.writeHead(204);
        res.end();
        return;
      }
      try {
        const payload = JSON.parse(raw);
        if (payload?.ref !== `refs/heads/${BRANCH}`) {
          res.writeHead(204);
          res.end(`ignored ref ${payload?.ref}`);
          return;
        }
        res.writeHead(202);
        res.end('accepted');
        deploy(payload).catch((e) => console.error(e));
      } catch (e) {
        res.writeHead(400);
        res.end('bad json');
      }
    });
  })
  .listen(PORT, () => {
    console.log(`[webhook] listening on :${PORT}  (branch=${BRANCH}, secret=${SECRET ? 'yes' : 'no'})`);
  });
