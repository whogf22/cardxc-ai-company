// src/utils/logger.js — simple structured logger (console + file)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOG_DIR = path.resolve(__dirname, '../../data/logs');

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

const LEVEL_COLOR = {
  info: COLORS.cyan,
  warn: COLORS.yellow,
  error: COLORS.red,
  success: COLORS.green,
  debug: COLORS.dim,
};

function stamp() {
  return new Date().toISOString();
}

function writeFile(level, line) {
  const today = new Date().toISOString().slice(0, 10);
  const file = path.join(LOG_DIR, `${today}.log`);
  try {
    fs.appendFileSync(file, line + '\n');
  } catch (e) {
    // fail silent
  }
}

function format(level, scope, msg, meta) {
  const ts = stamp();
  const metaStr = meta ? ' ' + JSON.stringify(meta) : '';
  return `[${ts}] [${level.toUpperCase()}] [${scope}] ${msg}${metaStr}`;
}

export class Logger {
  constructor(scope = 'app') {
    this.scope = scope;
  }

  _log(level, msg, meta) {
    const line = format(level, this.scope, msg, meta);
    const color = LEVEL_COLOR[level] || COLORS.reset;
    // eslint-disable-next-line no-console
    console.log(color + line + COLORS.reset);
    writeFile(level, line);
  }

  info(msg, meta) { this._log('info', msg, meta); }
  warn(msg, meta) { this._log('warn', msg, meta); }
  error(msg, meta) { this._log('error', msg, meta); }
  success(msg, meta) { this._log('success', msg, meta); }
  debug(msg, meta) {
    if (process.env.DEBUG === 'true') this._log('debug', msg, meta);
  }

  child(subscope) {
    return new Logger(`${this.scope}:${subscope}`);
  }
}

export const logger = new Logger('cardxc');
export default logger;
