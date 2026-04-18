// Multi-model router — picks the best/cheapest AI for each task
// Falls back gracefully if one provider fails.
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import axios from 'axios';
import { logger } from '../utils/logger.js';

export class ModelRouter {
  constructor() {
    this.claude = process.env.ANTHROPIC_API_KEY
      ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      : null;

    // OpenRouter — 300+ models through OpenAI-compatible API
    this.openrouter = process.env.OPENROUTER_API_KEY
      ? new OpenAI({
          apiKey: process.env.OPENROUTER_API_KEY,
          baseURL: 'https://openrouter.ai/api/v1'
        })
      : null;

    // AIMLAPI — cheap GPT/Claude access
    this.aimlapi = process.env.AIMLAPI_KEY
      ? new OpenAI({
          apiKey: process.env.AIMLAPI_KEY,
          baseURL: 'https://api.aimlapi.com/v1'
        })
      : null;

    // Together AI — open-source models
    this.together = process.env.TOGETHER_API_KEY
      ? new OpenAI({
          apiKey: process.env.TOGETHER_API_KEY,
          baseURL: 'https://api.together.xyz/v1'
        })
      : null;

    // DeepInfra — cheap inference
    this.deepinfra = process.env.DEEPINFRA_API_KEY
      ? new OpenAI({
          apiKey: process.env.DEEPINFRA_API_KEY,
          baseURL: 'https://api.deepinfra.com/v1/openai'
        })
      : null;

    // Groq — ultra-fast LPU inference (<200ms) for Agno FastAgent
    this.groq = process.env.GROQ_API_KEY
      ? new OpenAI({
          apiKey: process.env.GROQ_API_KEY,
          baseURL: 'https://api.groq.com/openai/v1'
        })
      : null;

    // OpenAI — GPT-4o for AutoGen Council + fallback
    this.openai = process.env.OPENAI_API_KEY
      ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      : null;
  }

  // Task profiles — which model fits what
  //   brain:   needs deep reasoning (planning, code review)
  //   coder:   code writing (Claude best)
  //   bulk:    high volume, cheap (blog posts, SEO copy)
  //   fast:    low-latency (chat reply)
  //   cheap:   cost-optimized fallback
  async complete({ task = 'brain', system = '', messages = [], maxTokens = 2048, jsonMode = false }) {
    const providers = this.selectProviders(task);
    let lastError;

    for (const provider of providers) {
      try {
        const result = await this[provider.handler]({
          model: provider.model,
          system,
          messages,
          maxTokens,
          jsonMode
        });
        if (result) {
          logger.debug(`✅ ${provider.name} responded`);
          return { text: result, provider: provider.name, model: provider.model };
        }
      } catch (e) {
        logger.warn(`⚠️ ${provider.name} failed: ${e.message?.slice(0, 150)}`);
        lastError = e;
      }
    }
    throw new Error(`All providers failed: ${lastError?.message}`);
  }

  selectProviders(task) {
    const routes = {
      brain: [
        { name: 'Claude-Sonnet', handler: 'callClaude', model: 'claude-sonnet-4-5-20250929' },
        { name: 'OpenRouter-Opus', handler: 'callOpenRouter', model: 'anthropic/claude-opus-4' },
        { name: 'OpenRouter-GPT4', handler: 'callOpenRouter', model: 'openai/gpt-4o' }
      ],
      coder: [
        { name: 'Claude-Sonnet', handler: 'callClaude', model: 'claude-sonnet-4-5-20250929' },
        { name: 'OpenRouter-DeepSeek', handler: 'callOpenRouter', model: 'deepseek/deepseek-chat-v3.1' },
        { name: 'AIMLAPI-Claude', handler: 'callAIMLAPI', model: 'claude-3-7-sonnet-20250219' }
      ],
      bulk: [
        { name: 'DeepInfra-Llama', handler: 'callDeepInfra', model: 'meta-llama/Meta-Llama-3.1-70B-Instruct' },
        { name: 'Together-Llama', handler: 'callTogether', model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' },
        { name: 'AIMLAPI-GPT', handler: 'callAIMLAPI', model: 'gpt-4o-mini' }
      ],
      fast: [
        { name: 'Groq-Llama70B', handler: 'callGroq', model: 'llama-3.3-70b-versatile' },
        { name: 'Together-Llama', handler: 'callTogether', model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' },
        { name: 'DeepInfra-Fast', handler: 'callDeepInfra', model: 'meta-llama/Meta-Llama-3.1-8B-Instruct' }
      ],
      realtime: [
        { name: 'Groq-Llama70B', handler: 'callGroq', model: 'llama-3.3-70b-versatile' },
        { name: 'Groq-Llama8B', handler: 'callGroq', model: 'llama-3.1-8b-instant' }
      ],
      debate: [
        { name: 'OpenAI-GPT4o', handler: 'callOpenAI', model: 'gpt-4o' },
        { name: 'Claude-Sonnet', handler: 'callClaude', model: 'claude-sonnet-4-5-20250929' },
        { name: 'OpenRouter-GPT4', handler: 'callOpenRouter', model: 'openai/gpt-4o' }
      ],
      cheap: [
        { name: 'DeepInfra-Small', handler: 'callDeepInfra', model: 'meta-llama/Meta-Llama-3.1-8B-Instruct' },
        { name: 'Together-Small', handler: 'callTogether', model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' },
        { name: 'AIMLAPI-Mini', handler: 'callAIMLAPI', model: 'gpt-4o-mini' }
      ]
    };
    return routes[task] || routes.brain;
  }

  async callClaude({ model, system, messages, maxTokens }) {
    if (!this.claude) return null;
    const r = await this.claude.messages.create({
      model, max_tokens: maxTokens,
      system: system || undefined,
      messages: messages.map(m => ({ role: m.role, content: m.content }))
    });
    return r.content?.[0]?.text || '';
  }

  async callOpenRouter({ model, system, messages, maxTokens, jsonMode }) {
    if (!this.openrouter) return null;
    const r = await this.openrouter.chat.completions.create({
      model,
      max_tokens: maxTokens,
      messages: system ? [{ role: 'system', content: system }, ...messages] : messages,
      response_format: jsonMode ? { type: 'json_object' } : undefined
    });
    return r.choices?.[0]?.message?.content || '';
  }

  async callAIMLAPI({ model, system, messages, maxTokens }) {
    if (!this.aimlapi) return null;
    const r = await this.aimlapi.chat.completions.create({
      model, max_tokens: maxTokens,
      messages: system ? [{ role: 'system', content: system }, ...messages] : messages
    });
    return r.choices?.[0]?.message?.content || '';
  }

  async callTogether({ model, system, messages, maxTokens }) {
    if (!this.together) return null;
    const r = await this.together.chat.completions.create({
      model, max_tokens: maxTokens,
      messages: system ? [{ role: 'system', content: system }, ...messages] : messages
    });
    return r.choices?.[0]?.message?.content || '';
  }

  async callDeepInfra({ model, system, messages, maxTokens }) {
    if (!this.deepinfra) return null;
    const r = await this.deepinfra.chat.completions.create({
      model, max_tokens: maxTokens,
      messages: system ? [{ role: 'system', content: system }, ...messages] : messages
    });
    return r.choices?.[0]?.message?.content || '';
  }

  async callGroq({ model, system, messages, maxTokens, jsonMode }) {
    if (!this.groq) return null;
    const r = await this.groq.chat.completions.create({
      model, max_tokens: maxTokens,
      messages: system ? [{ role: 'system', content: system }, ...messages] : messages,
      response_format: jsonMode ? { type: 'json_object' } : undefined
    });
    return r.choices?.[0]?.message?.content || '';
  }

  async callOpenAI({ model, system, messages, maxTokens, jsonMode }) {
    if (!this.openai) return null;
    const r = await this.openai.chat.completions.create({
      model, max_tokens: maxTokens,
      messages: system ? [{ role: 'system', content: system }, ...messages] : messages,
      response_format: jsonMode ? { type: 'json_object' } : undefined
    });
    return r.choices?.[0]?.message?.content || '';
  }
}
