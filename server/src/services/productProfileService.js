/**
 * productProfileService.js
 * -----------------------------------------------------------------------------
 * The merchant side of the AI (spec sections 11 and 12).
 *
 * A merchant types what they always type - name, price, a sentence of
 * description - and BuyWise turns it into an AI Commerce Profile: structured
 * features, use cases and audiences that the shopping agent can reason about.
 *
 * Without an LLM key this still works: the rule generator reads the same
 * keyword vocabulary the intent engine uses, so a merchant's plain description
 * becomes discoverable either way.
 */
import { completeJson, isLlmEnabled } from './llm/index.js';
import { ATTRIBUTES, CATEGORY_SYNONYMS, USE_CASES, attributesForCategory } from './knowledgeBase.js';

/* ------------------------------------------------------------ rules version */

function detectCategory(text) {
  const lower = text.toLowerCase();
  let best = null;
  for (const [category, words] of Object.entries(CATEGORY_SYNONYMS)) {
    for (const word of words) {
      if (lower.includes(word) && (!best || word.length > best.length)) {
        best = { category, length: word.length };
      }
    }
  }
  return best?.category || null;
}

function detectFeatures(text, category) {
  const lower = text.toLowerCase();
  const features = {};
  for (const attr of attributesForCategory(category)) {
    for (const keyword of attr.keywords) {
      const index = lower.indexOf(keyword);
      if (index === -1) continue;
      if (attr.type === 'boolean') {
        features[attr.key] = true;
      } else {
        const window = lower.slice(Math.max(0, index - 30), index + keyword.length + 20);
        const match = window.match(/([\d.]+)/);
        if (match) features[attr.key] = parseFloat(match[1]);
      }
      break;
    }
  }
  return features;
}

function detectUseCases(text) {
  const lower = text.toLowerCase();
  return Object.entries(USE_CASES)
    .filter(([, words]) => words.some((w) => lower.includes(w)))
    .map(([useCase]) => useCase);
}

const AUDIENCE_BY_USE_CASE = {
  study: 'students',
  college: 'students',
  travel: 'travellers',
  office: 'office workers',
  gaming: 'gamers',
  coding: 'developers',
  fitness: 'fitness enthusiasts',
  photography: 'content creators',
  entertainment: 'everyday users',
};

export function generateProfileWithRules({ name, description, price, category }) {
  const text = `${name} ${description}`;
  const resolved = category || detectCategory(text) || 'headphones';
  const features = detectFeatures(text, resolved);
  const useCases = detectUseCases(text);

  // A product with no detected use case still needs to be discoverable.
  if (!useCases.length) {
    if (resolved === 'backpack') useCases.push('college', 'travel');
    else if (resolved === 'laptop') useCases.push('office', 'coding');
    else if (resolved === 'headphones') useCases.push('study', 'travel');
    else useCases.push('office');
  }

  const highlights = Object.entries(features)
    .slice(0, 4)
    .map(([key, value]) => {
      const attr = ATTRIBUTES[key];
      if (!attr) return null;
      return attr.type === 'boolean'
        ? attr.label
        : `${attr.label}: ${value}${attr.unit && attr.unit !== 'score' ? ` ${attr.unit}` : ''}`;
    })
    .filter(Boolean);

  return {
    category: resolved,
    features,
    useCases,
    suitableFor: [...new Set(useCases.map((u) => AUDIENCE_BY_USE_CASE[u]).filter(Boolean))],
    highlights: highlights.length ? highlights : [description?.slice(0, 60) || name],
    tags: [resolved, ...useCases, ...Object.keys(features)],
    generatedBy: 'rules',
  };
}

/* -------------------------------------------------------------- LLM version */

const SYSTEM_PROMPT = `You are the product-intelligence engine of BuyWise AI, an Indian marketplace.
A merchant gives you an ordinary product listing. Convert it into an AI Commerce Profile so a
shopping agent can reason about the product instead of keyword-matching it.

Valid categories: ${Object.keys(CATEGORY_SYNONYMS).join(', ')}
Valid use cases: ${Object.keys(USE_CASES).join(', ')}
Valid feature keys (use ONLY these, with the given types):
${Object.entries(ATTRIBUTES)
  .map(([k, v]) => `  ${k}: ${v.type}${v.unit ? ` in ${v.unit}` : ''} - ${v.label}`)
  .join('\n')}

Return exactly:
{
  "category": "<one category>",
  "features": { "<featureKey>": true | <number> },
  "useCases": ["..."],
  "suitableFor": ["students", "travellers", ...],
  "highlights": ["four short selling points, max 8 words each"],
  "tags": ["searchable keywords"]
}

Only claim a feature the listing actually supports or that is genuinely standard for the product
type and price. Do not invent specifications.`;

export async function generateProductProfile(input) {
  const fallback = generateProfileWithRules(input);
  if (!isLlmEnabled()) return fallback;

  const result = await completeJson({
    system: SYSTEM_PROMPT,
    maxTokens: 700,
    prompt: `Product name: ${input.name}
Price: ₹${input.price}
Merchant description: ${input.description || '(none given)'}
Merchant-selected category: ${input.category || '(none)'}`,
  });

  if (!result.ok || !result.data) return fallback;

  const data = result.data;
  const category = CATEGORY_SYNONYMS[data.category] ? data.category : fallback.category;

  const features = {};
  for (const [key, value] of Object.entries(data.features || {})) {
    const attr = ATTRIBUTES[key];
    if (!attr) continue;
    if (attr.type === 'boolean') features[key] = Boolean(value);
    else if (Number.isFinite(Number(value))) features[key] = Number(value);
  }

  const asArray = (v, limit) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, limit) : []);

  return {
    category,
    features: Object.keys(features).length ? features : fallback.features,
    useCases: asArray(data.useCases, 5).length ? asArray(data.useCases, 5) : fallback.useCases,
    suitableFor: asArray(data.suitableFor, 5),
    highlights: asArray(data.highlights, 5).length ? asArray(data.highlights, 5) : fallback.highlights,
    tags: [...new Set([...asArray(data.tags, 12), category])],
    generatedBy: result.provider,
  };
}
