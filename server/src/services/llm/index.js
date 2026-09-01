/**
 * services/llm/index.js
 * -----------------------------------------------------------------------------
 * One narrow interface to whichever LLM is configured.
 *
 *   completeJson(...)  ask the model for a strict JSON object
 *   completeText(...)  ask the model for a sentence or two of prose
 *
 * Both return `{ ok, data|text, provider }`. When no key is configured, or the
 * provider errors, `ok` is false and the caller falls back to BuyWise's
 * deterministic rule engine - the agent never goes down because of the LLM.
 */
import { config } from '../../config/env.js';

const TIMEOUT_MS = 20000;

/** Which provider will actually be used, given the configured keys. */
export function activeProvider() {
  const { provider, anthropicKey, geminiKey, openaiKey } = config.ai;
  if (provider === 'rules') return 'rules';
  if (provider === 'anthropic') return anthropicKey ? 'anthropic' : 'rules';
  if (provider === 'gemini') return geminiKey ? 'gemini' : 'rules';
  if (provider === 'openai') return openaiKey ? 'openai' : 'rules';
  // auto
  if (anthropicKey) return 'anthropic';
  if (geminiKey) return 'gemini';
  if (openaiKey) return 'openai';
  return 'rules';
}

export const isLlmEnabled = () => activeProvider() !== 'rules';

async function withTimeout(promise) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await promise(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------- the providers */

async function callAnthropic({ system, prompt, maxTokens, signal }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.ai.anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.ai.anthropicModel,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return (json.content || []).map((block) => block.text || '').join('');
}

async function callGemini({ system, prompt, maxTokens, signal }) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${config.ai.geminiModel}` +
    `:generateContent?key=${config.ai.geminiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.3 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return (json.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
}

async function callOpenAI({ system, prompt, maxTokens, signal }) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.ai.openaiKey}`,
    },
    body: JSON.stringify({
      model: config.ai.openaiModel,
      max_tokens: maxTokens,
      temperature: 0.3,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.choices?.[0]?.message?.content || '';
}

const PROVIDERS = {
  anthropic: callAnthropic,
  gemini: callGemini,
  openai: callOpenAI,
};

/* ------------------------------------------------------------------ the API */

async function complete({ system, prompt, maxTokens = 1024 }) {
  const provider = activeProvider();
  if (provider === 'rules') return { ok: false, provider: 'rules', error: 'no LLM configured' };
  try {
    const text = await withTimeout((signal) =>
      PROVIDERS[provider]({ system, prompt, maxTokens, signal })
    );
    return { ok: true, provider, text };
  } catch (err) {
    console.warn(`[llm:${provider}] ${err.message}`);
    return { ok: false, provider, error: err.message };
  }
}

export async function completeText(args) {
  const result = await complete(args);
  return result.ok ? { ...result, text: result.text.trim() } : result;
}

/** Ask for JSON and parse it defensively - models like to wrap it in prose. */
export async function completeJson(args) {
  const result = await complete({
    ...args,
    system: `${args.system}\n\nRespond with a single valid JSON object and nothing else. No markdown fences, no commentary.`,
  });
  if (!result.ok) return result;
  const data = extractJson(result.text);
  if (!data) return { ok: false, provider: result.provider, error: 'unparseable JSON' };
  return { ok: true, provider: result.provider, data };
}

export function extractJson(text) {
  if (!text) return null;
  const withoutFence = text.replace(/```(?:json)?/gi, '').trim();
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(withoutFence.slice(start, end + 1));
  } catch {
    return null;
  }
}
