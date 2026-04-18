// src/integrations/telegram.js — Telegram bot wrapper for command + notifications
import TelegramBot from 'node-telegram-bot-api';
import { logger } from '../utils/logger.js';

const log = logger.child('telegram');

export class TelegramService {
  constructor(token, chatId) {
    this.token = token;
    this.chatId = chatId;
    this.bot = null;
    this.handlers = [];
    this.enabled = !!(token && chatId);

    if (!this.enabled) {
      log.warn('Telegram disabled — set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID in .env');
      return;
    }

    try {
      this.bot = new TelegramBot(token, { polling: true });
      log.success('Telegram bot started (polling)');
      this._wireEvents();
    } catch (e) {
      log.error('Telegram bot init failed', { error: e.message });
      this.enabled = false;
    }
  }

  _wireEvents() {
    this.bot.on('message', async (msg) => {
      // Only accept messages from owner chat
      if (String(msg.chat.id) !== String(this.chatId)) {
        log.warn('Ignored message from unauthorized chat', { chatId: msg.chat.id });
        return;
      }
      const text = (msg.text || '').trim();
      if (!text) return;
      log.info('Received message', { text: text.slice(0, 100) });

      for (const handler of this.handlers) {
        try {
          await handler(text, msg);
        } catch (e) {
          log.error('Handler error', { error: e.message });
          await this.send(`⚠️ Handler error: ${e.message}`);
        }
      }
    });

    this.bot.on('polling_error', (err) => {
      log.error('Polling error', { error: err.message });
    });
  }

  onMessage(handler) {
    this.handlers.push(handler);
  }

  async send(text, opts = {}) {
    if (!this.enabled) {
      log.info('[TG disabled] ' + text.slice(0, 200));
      return;
    }
    try {
      // Telegram max is 4096 chars — chunk safely
      const MAX = 3900;
      if (text.length <= MAX) {
        return await this.bot.sendMessage(this.chatId, text, {
          parse_mode: 'Markdown',
          ...opts,
        });
      }
      for (let i = 0; i < text.length; i += MAX) {
        await this.bot.sendMessage(this.chatId, text.slice(i, i + MAX), opts);
      }
    } catch (e) {
      // retry without markdown in case of parse error
      try {
        await this.bot.sendMessage(this.chatId, text.slice(0, 3900));
      } catch (e2) {
        log.error('Telegram send failed', { error: e2.message });
      }
    }
  }

  async notify(title, body) {
    const msg = `*${title}*\n\n${body}`;
    return this.send(msg);
  }
}

export default TelegramService;
