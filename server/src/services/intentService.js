/**
 * intentService.js
 * -----------------------------------------------------------------------------
 * Human language  ->  machine-understandable requirements.
 *
 * This is the USP of BuyWise (spec section 3). It does not keyword-match; it
 * builds a structured requirement object that the recommendation engine can
 * reason over, and it MERGES that object into what the shopper already told us,
 * so "make it 4000 instead" only changes the budget.
 *
 * Two paths, same output shape:
 *   - LLM path   : an instruction-tuned model fills the schema
 *   - Rules path : a deterministic extractor (always available, also used as
 *                  a safety net when the model returns something unusable)
 */
import { completeJson, isLlmEnabled } from './llm/index.js';
import { getBrandIndex } from './productService.js';
import {
  ATTRIBUTES,
  CATEGORY_SYNONYMS,
  CLARIFYING_QUESTIONS,
  USE_CASES,
  attributesForCategory,
  categoryFromBrand,
} from './knowledgeBase.js';

export const INTENTS = {
  GREETING: 'greeting',
  PRODUCT_SEARCH: 'product_search',
  REFINE_SEARCH: 'refine_search',
  COMPARE: 'compare',
  ADD_TO_CART: 'add_to_cart',
  VIEW_CART: 'view_cart',
  CHECKOUT: 'checkout',
  QUESTION: 'question',
};

const emptyRequirements = () => ({
  category: null,
  minPrice: null,
  maxPrice: null,
  brand: null,
  useCase: null,
  requirements: {},
  priorities: {},
});

/* ============================================================ rules engine */

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };

/** "2,000" / "2000" / "2k" / "1.5 lakh" -> 2000 / 2000 / 2000 / 150000 */
function parseAmount(raw) {
  if (!raw) return null;
  const text = String(raw).toLowerCase().replace(/[,\s₹rs.]/g, '');
  const match = text.match(/([\d.]+)(k|lakh|lac|l)?/);
  if (!match) return null;
  let value = parseFloat(match[1]);
  if (!Number.isFinite(value)) return null;
  if (match[2] === 'k') value *= 1000;
  if (match[2] === 'lakh' || match[2] === 'lac' || match[2] === 'l') value *= 100000;
  return Math.round(value);
}

function extractBudget(text) {
  const out = { minPrice: null, maxPrice: null };

  const between = text.match(
    /(?:between|from)\s*(?:₹|rs\.?|inr)?\s*([\d.,]+\s*k?)\s*(?:and|to|-)\s*(?:₹|rs\.?|inr)?\s*([\d.,]+\s*k?)/i
  );
  if (between) {
    out.minPrice = parseAmount(between[1]);
    out.maxPrice = parseAmount(between[2]);
    return out;
  }

  // "max" on its own is NOT a budget signal - product names are full of it
  // ("Endura Max 6000", "SoundMax Pro"). It only counts when followed by a
  // budget noun or a currency symbol, which is what a shopper actually writes.
  const upper = text.match(
    new RegExp(
      '\\b(?:under|below|less than|within|upto|up to|at most|no more than|not more than|' +
        'cheaper than|budget(?:\\s+(?:is|of|around|about))?|' +
        'max(?:imum)?\\s+(?:budget|price|spend|of|is)|' +
        'max(?:imum)?\\s*(?:₹|rs\\.?|inr)|' +
        'increase(?:\\s+\\w+){0,3}\\s+to|raise(?:\\s+\\w+){0,3}\\s+to)' +
        '\\s*(?:₹|rs\\.?|inr)?\\s*([\\d.,]+\\s*(?:k|lakh|lac)?)',
      'i'
    )
  );
  if (upper) {
    const value = parseAmount(upper[1]);
    // A "budget" in single digits is a misread, not a price.
    if (value && value >= 50) {
      out.maxPrice = value;
      return out;
    }
  }

  const lower = text.match(/(?:above|over|more than|at least|minimum)\s*(?:₹|rs\.?|inr)?\s*([\d.,]+\s*(?:k|lakh|lac)?)/i);
  if (lower) {
    out.minPrice = parseAmount(lower[1]);
    return out;
  }

  // "around 2000", "₹2,000", "2000 rupees", "20000 budget", "20k budget"
  const loose =
    text.match(/(?:around|about|approx(?:imately)?|near|roughly)?\s*(?:₹|rs\.?|inr)\s*([\d.,]+\s*(?:k|lakh|lac)?)/i) ||
    // The number can come FIRST - "20000 budget" is as natural as "budget 20000".
    text.match(/([\d.,]+\s*(?:k|lakh|lac)?)\s*(?:rupees|rs\b|inr|bucks|budget|only|max(?:imum)?)\b/i) ||
    text.match(/(?:around|about|approx(?:imately)?|roughly)\s+([\d.,]+\s*(?:k|lakh|lac)?)\b/i);
  if (loose) {
    const value = parseAmount(loose[1]);
    // A bare number under 100 is far more likely to be a spec than a price.
    if (value && value >= 100) out.maxPrice = value;
  }
  return out;
}

/**
 * The shopper is answering the question we just asked.
 *
 * When the agent has said "What budget are you working with?", a reply of
 * "20000" is unambiguous - and expecting them to write "under 20000" instead
 * would be the interface bossing them around.
 */
function budgetFromDirectAnswer(text) {
  const bare = String(text)
    .trim()
    .match(/^(?:₹|rs\.?|inr)?\s*([\d.,]+\s*(?:k|lakh|lac)?)\s*(?:rupees|rs|inr|bucks|budget|only|max(?:imum)?)?\.?$/i);
  if (!bare) return null;
  const value = parseAmount(bare[1]);
  return value && value >= 100 ? value : null;
}

function extractCategory(text) {
  let best = null;
  for (const [category, words] of Object.entries(CATEGORY_SYNONYMS)) {
    for (const word of words) {
      const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`, 'i');
      // Prefer the longest match so "laptop bag" wins over "laptop".
      if (re.test(text) && (!best || word.length > best.length)) {
        best = { category, word, length: word.length };
      }
    }
  }
  // No category word? A brand or product line still tells us the category.
  if (!best) {
    const hint = categoryFromBrand(text);
    if (hint) {
      return { category: hint.category, word: hint.brand, length: hint.brand.length, fromBrand: hint.brand };
    }
  }
  return best;
}

const EXPLICIT_SWITCH = /\b(actually|instead|rather|what about|how about|switch to|change to|different|forget the|not a)\b/i;

/**
 * Decide whether a category word really means "I want a different product".
 *
 * "I carry a 15.6 inch laptop" inside a backpack conversation names a
 * requirement of the backpack, not a new category - and "laptop" is exactly
 * the keyword the backpack's laptopCompartment attribute listens for. So when
 * a detected category word doubles as an attribute of the category we are
 * already discussing, we keep the current category unless the shopper clearly
 * signalled a switch.
 */
function resolveCategory(detected, previous, text) {
  if (!detected) return previous?.category || null;
  if (!previous?.category || detected.category === previous.category) return detected.category;

  const isAttributeOfCurrent = attributesForCategory(previous.category).some((attr) =>
    attr.keywords.some((k) => k === detected.word || k.includes(detected.word))
  );
  const carriedNotSought = new RegExp(
    `\\b(carry|carries|carrying|fits?|holds?|store|keep|my|with my|for my)\\b[^.]{0,25}${detected.word}`,
    'i'
  ).test(text);

  if ((isAttributeOfCurrent || carriedNotSought) && !EXPLICIT_SWITCH.test(text)) {
    return previous.category;
  }
  return detected.category;
}

function extractUseCase(text) {
  for (const [useCase, words] of Object.entries(USE_CASES)) {
    if (words.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(text))) return useCase;
  }
  return null;
}

const NEGATION = /\b(no|not|without|don'?t need|dont need|do not need|skip)\b[^.,;]{0,25}$/i;

/** Was this keyword mentioned in a negative sentence? ("no noise cancellation") */
function isNegated(text, keywordIndex) {
  const before = text.slice(Math.max(0, keywordIndex - 30), keywordIndex);
  return NEGATION.test(`${before} `) || /\b(no|without|not)\s+$/i.test(before);
}

/** Letter suffixes that may legitimately be glued to a number. */
const UNITS = [
  'gb', 'tb', 'mb', 'hours', 'hour', 'hrs', 'hr', 'h', 'inch', 'inches', 'in',
  'litres', 'litre', 'liters', 'liter', 'ltr', 'l', 'mp', 'kg', 'mah',
];

/**
 * Find a number that genuinely belongs to a keyword.
 *
 * Accepts "35 hours battery", "battery of at least 35", "15.6 inch laptop",
 * "8gb ram". Rejects a number that merely shares the sentence: "good battery
 * life and 4g" must NOT become a 4-hour battery, because a loose match here
 * silently corrupts every downstream score.
 */
function findNumberNear(text, index, keywordLength) {
  const before = text.slice(Math.max(0, index - 22), index);
  const after = text.slice(index + keywordLength, index + keywordLength + 26);

  // "...at least 35 hours " + keyword   |   "15.6 inch " + laptop   |   "8gb " + ram
  // The unit may sit between the number and the keyword, so allow one word
  // there - but it has to BE a unit, which is what keeps "4g" out.
  // The `-?` matters: people write "15-inch laptop" as often as "15 inch".
  const trailing = before.match(/(\d+(?:\.\d+)?)\s*-?\s*([a-z"]*)\s*(?:of\s+)?[\s-]*$/i);
  if (trailing) {
    const value = readNumber(trailing[1], trailing[2]);
    if (value !== null) return value;
  }

  // keyword + " of at least 35 hours" / " : 35" / " 35 hours"
  const leading = after.match(
    /^\s*(?:life|capacity|size)?\s*(?:(?:of|is|:|=|at\s*least|atleast|around|about|min(?:imum)?|>=)\s*)*(\d+(?:\.\d+)?)\s*-?\s*([a-z"]*)/i
  );
  if (leading) return readNumber(leading[1], leading[2]);

  return null;
}

/**
 * A number glued to letters is only a quantity when those letters are a unit.
 * "4g" and "5g" are network generations; "y16" is a model name.
 */
function readNumber(digits, suffix) {
  if (suffix && !UNITS.includes(suffix.toLowerCase())) return null;
  const value = parseFloat(digits);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function extractAttributeRequirements(text, category) {
  const found = {};
  const relevant = attributesForCategory(category);

  for (const attr of relevant) {
    for (const keyword of attr.keywords) {
      const index = text.toLowerCase().indexOf(keyword);
      if (index === -1) continue;

      if (attr.type === 'boolean') {
        found[attr.key] = !isNegated(text, index);
        break;
      }

      // Numeric: the number has to be ATTACHED to the keyword, not merely
      // nearby. A loose window turns "good battery life and 4g" into
      // "4 hours of battery", which is worse than extracting nothing.
      const value = findNumberNear(text, index, keyword.length);
      if (value !== null) {
        found[attr.key] = value;
        break;
      }
      // Mentioned but no number: treat as "this matters to me".
      found[attr.key] = true;
      break;
    }
  }
  return found;
}

/**
 * Trade-off language (spec section 9).
 * "battery is more important than anc"  -> battery:high, anc:medium
 * "I mainly care about the camera"      -> camera:high
 */
function extractPriorities(text, category) {
  const priorities = {};
  const relevant = attributesForCategory(category);
  const lower = text.toLowerCase();

  const findAttr = (fragment) =>
    relevant.find((a) => a.keywords.some((k) => fragment.includes(k)) || fragment.includes(a.key));

  /**
   * Trade-offs arrive in several shapes, and all of them mean the same thing.
   * The winner goes to HIGH, the thing it was preferred over drops to MEDIUM,
   * which is what actually re-weights the scoring pillars.
   *
   *   "battery is more important than ANC"
   *   "I care more about battery life than noise cancellation"
   *   "prioritise battery over noise cancellation"
   *   "I'd rather have battery than ANC"
   */
  const COMPARATIVES = [
    // <winner> ... more important/matters more ... than <loser>
    /(.{0,45}?)\s*(?:is|are)?\s*(?:more important|matters more|is a priority|takes priority|beats)\s*(?:than|over)?\s*(.{0,45})/,
    // care/prefer/prioritise/value/want <winner> more than/over <loser>
    /(?:care|prefer|prioriti[sz]e|value|want|need|focus)\s*(?:more)?\s*(?:about|on|for)?\s*(.{0,45}?)\s*(?:more\s+)?(?:than|over|rather than)\s*(.{0,45})/,
    // "I'd rather have <winner> than <loser>"
    /rather\s+(?:have|get)?\s*(.{0,45}?)\s+than\s+(.{0,45})/,
  ];

  for (const pattern of COMPARATIVES) {
    const match = lower.match(pattern);
    if (!match) continue;
    const winner = findAttr(match[1]);
    const loser = findAttr(match[2]);
    if (!winner && !loser) continue;
    if (winner) priorities[winner.key] = 'high';
    if (loser && loser.key !== winner?.key) priorities[loser.key] = 'medium';
    break;
  }

  const emphasis = lower.match(
    /(?:mainly|mostly|really|especially|above all|most important(?:ly)?|top priority)\s*(?:care about|want|need|value|is|important)?\s*(.{0,45})/
  );
  if (emphasis) {
    const attr = findAttr(emphasis[1]);
    if (attr && !priorities[attr.key]) priorities[attr.key] = 'high';
  }

  if (/\b(cheap|cheaper|budget friendly|affordable|save money|lowest price)\b/.test(lower)) {
    priorities.price = 'high';
  }
  if (/\b(best|premium|top quality|don'?t care about price|money no issue)\b/.test(lower)) {
    priorities.quality = 'high';
  }
  return priorities;
}

/** Brands we recognise even when nothing by them is currently in stock. */
const SEED_BRANDS = [
  'sony', 'boat', 'jbl', 'samsung', 'apple', 'oneplus', 'realme', 'redmi', 'xiaomi',
  'noise', 'boult', 'sennheiser', 'hp', 'dell', 'lenovo', 'asus', 'acer', 'msi',
  'american tourister', 'skybags', 'wildcraft', 'safari', 'fastrack', 'logitech',
  'keychron', 'vivo', 'oppo', 'poco', 'iqoo', 'motorola', 'nokia', 'infinix',
];

// Some brand names are also feature words ("Noise" the brand vs "noise
// cancellation"). Only treat them as a brand when they don't read as a spec.
const AMBIGUOUS_BRANDS = {
  noise: /noise\s*(cancel\w*|isolat\w*|reduc\w*)/,
  apple: /apple\s*(juice|pie)/,
  safari: /safari\s*(browser|park|trip)/,
};

/**
 * @param catalogueBrands brands read from the live catalogue, so a brand a
 *   merchant added five minutes ago is recognised immediately.
 */
function extractBrand(text, catalogueBrands = []) {
  const lower = text.toLowerCase();
  const known = [...new Set([...catalogueBrands, ...SEED_BRANDS])]
    // Longest first, so "american tourister" beats a stray "safari".
    .sort((a, b) => b.length - a.length);

  return (
    known.find((brand) => {
      if (!new RegExp(`\\b${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lower)) {
        return false;
      }
      return !AMBIGUOUS_BRANDS[brand]?.test(lower);
    }) || null
  );
}

function detectIntent(text, hasContext) {
  const lower = text.toLowerCase().trim();

  if (/^(hi|hii|hey|hello|yo|namaste|good (morning|evening|afternoon))\b/.test(lower)) {
    return INTENTS.GREETING;
  }
  if (/\b(add (it|this|that|the \w+)? ?to (my )?cart|buy (it|this|that)|i'?ll (take|buy) (it|this)|book it|purchase (it|this))\b/.test(lower)) {
    return INTENTS.ADD_TO_CART;
  }
  if (/\b(show|open|what'?s in|view|see) (my )?cart\b/.test(lower)) return INTENTS.VIEW_CART;
  if (/\b(checkout|check out|place (the )?order|proceed to pay|pay now|complete (my )?order)\b/.test(lower)) {
    return INTENTS.CHECKOUT;
  }
  if (/\b(compare|difference between|vs\.?|versus|which is better)\b/.test(lower)) return INTENTS.COMPARE;

  const refining =
    /\b(cheaper|costlier|something else|show more|other options|instead|what if|increase|decrease|raise|lower|better|but |however|also |alternatives?)\b/.test(
      lower
    );
  if (hasContext && (refining || lower.split(/\s+/).length <= 8)) return INTENTS.REFINE_SEARCH;

  if (/\?$/.test(lower) && !/\b(under|below|budget|need|want|looking|find|show|suggest|recommend)\b/.test(lower)) {
    return INTENTS.QUESTION;
  }
  return INTENTS.PRODUCT_SEARCH;
}

/** Pure-JS extraction. Always runs, so the platform never depends on the LLM. */
export function extractWithRules(
  message,
  previous = emptyRequirements(),
  brandIndex = { brands: [], categoryByBrand: {} },
  { expecting = null } = {}
) {
  const text = String(message || '');
  const hasContext = Boolean(previous?.category);
  const intent = detectIntent(text, hasContext);

  const detected = extractCategory(text);
  let category = resolveCategory(detected, previous, text);

  // Still no category, but we recognised a brand we stock: that brand's own
  // products tell us the category, no hardcoded mapping required.
  const brandFromText = extractBrand(text, brandIndex.brands || []);
  let categoryFromCatalogueBrand = null;
  if (!category && brandFromText && brandIndex.categoryByBrand?.[brandFromText]) {
    category = brandIndex.categoryByBrand[brandFromText];
    categoryFromCatalogueBrand = brandFromText;
  }
  const budget = extractBudget(text);
  const useCase = extractUseCase(text);
  const brand = brandFromText;
  const attrs = extractAttributeRequirements(text, category);
  const priorities = extractPriorities(text, category);

  // We asked for a budget and they replied with just a number.
  if (expecting === 'budget' && !budget.maxPrice && !budget.minPrice) {
    const answered = budgetFromDirectAnswer(text);
    if (answered) budget.maxPrice = answered;
  }

  // "show me something cheaper" with no number: shave 25% off the known budget.
  if (!budget.maxPrice && /\b(cheaper|less expensive|lower price|budget option)\b/i.test(text) && previous.maxPrice) {
    budget.maxPrice = Math.round(previous.maxPrice * 0.75);
  }
  if (!budget.maxPrice && /\b(better|premium|higher end|upgrade)\b/i.test(text) && previous.maxPrice && !hasNumber(text)) {
    budget.maxPrice = Math.round(previous.maxPrice * 1.35);
  }

  return {
    intent,
    // Kept so the agent can fall back to a name lookup when it cannot work
    // out a category ("is the Vivo Y16 Pro any good?").
    freeText: category ? null : searchableTerms(text),
    // The category came only from a brand name, so the shopper asked about a
    // specific product. The agent should check we actually stock that brand
    // before answering as though we do.
    brandHint: detected?.fromBrand || categoryFromCatalogueBrand || null,
    requirements: mergeRequirements(previous, {
      category,
      minPrice: budget.minPrice,
      maxPrice: budget.maxPrice,
      brand,
      useCase,
      requirements: attrs,
      priorities,
    }),
    confidence: category ? 0.75 : 0.4,
    source: 'rules',
  };
}

const hasNumber = (text) => /\d/.test(text);

const STOP_WORDS = new Set([
  'tell', 'me', 'about', 'the', 'a', 'an', 'and', 'or', 'is', 'it', 'was', 'are',
  'good', 'bad', 'best', 'whether', 'choice', 'what', 'do', 'you', 'think', 'of',
  'i', 'need', 'want', 'looking', 'for', 'find', 'show', 'get', 'buy', 'my',
  'with', 'that', 'this', 'can', 'should', 'would', 'have', 'any', 'some', 'to',
  'in', 'on', 'at', 'be', 'please', 'help',
]);

/** The words worth matching against a product name, longest first. */
function searchableTerms(text) {
  const words = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s.]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
  return words.sort((a, b) => b.length - a.length).slice(0, 4).join(' ') || null;
}

/* ================================================================ merging */

/**
 * Conversation memory (spec section 8). New information overwrites old,
 * everything else is preserved, so the shopper never repeats themselves.
 */
export function mergeRequirements(previous, incoming) {
  const base = { ...emptyRequirements(), ...(previous || {}) };
  const next = { ...base };

  for (const key of ['category', 'minPrice', 'maxPrice', 'brand', 'useCase']) {
    if (incoming[key] !== null && incoming[key] !== undefined && incoming[key] !== '') {
      next[key] = incoming[key];
    }
  }
  next.requirements = { ...(base.requirements || {}) };
  for (const [key, value] of Object.entries(incoming.requirements || {})) {
    // A bare mention ("battery matters more than ANC") must not wipe out a
    // concrete threshold the shopper gave us earlier ("at least 30 hours").
    if (value === true && typeof next.requirements[key] === 'number') continue;
    next.requirements[key] = value;
  }
  next.priorities = { ...(base.priorities || {}), ...(incoming.priorities || {}) };

  // A boolean requirement explicitly turned off should disappear, not linger.
  for (const [key, value] of Object.entries(next.requirements)) {
    if (value === false) delete next.requirements[key];
  }
  return next;
}

/** What we still don't know, ordered by how much it would improve the search. */
export function missingInformation(requirements) {
  const missing = [];
  if (!requirements.category) missing.push('category');
  if (!requirements.maxPrice && !requirements.minPrice) missing.push('budget');
  if (!requirements.useCase) missing.push('useCase');

  const known = Object.keys(requirements.requirements || {});
  if (requirements.category && known.length === 0) missing.push(requirements.category);
  return missing;
}

export function nextClarifyingQuestion(requirements) {
  return nextClarification(requirements)?.question || null;
}

/** Which gap we are asking about, and the question to ask. */
export function nextClarification(requirements) {
  const [field] = missingInformation(requirements);
  if (!field) return null;
  const question = CLARIFYING_QUESTIONS[field] || null;
  if (!question) return null;
  // Normalise a category-specific prompt ("Do you carry a laptop?") to the
  // gap it is really probing, so the answer is read in the right context.
  return { field: ['category', 'budget', 'useCase'].includes(field) ? field : 'features', question };
}

/* ==================================================================== LLM */

const SYSTEM_PROMPT = `You are the intent-extraction engine of BuyWise AI, an Indian e-commerce shopping agent.
Convert the shopper's message into structured requirements. Prices are in Indian Rupees.

Valid categories: ${Object.keys(CATEGORY_SYNONYMS).join(', ')}
Valid use cases: ${Object.keys(USE_CASES).join(', ')}
Valid requirement keys and their types:
${Object.entries(ATTRIBUTES)
  .map(([k, v]) => `  ${k} (${v.type}${v.unit ? `, ${v.unit}` : ''}) - ${v.label}`)
  .join('\n')}

Return this exact schema:
{
  "intent": "greeting|product_search|refine_search|compare|add_to_cart|view_cart|checkout|question",
  "category": string|null,
  "minPrice": number|null,
  "maxPrice": number|null,
  "brand": string|null,
  "useCase": string|null,
  "requirements": { "<key>": number|true },
  "priorities": { "<key>|price|quality": "high|medium|low" },
  "reply": "one friendly sentence acknowledging what you understood"
}

Rules:
- Only include a field when the CURRENT message provides it; use null otherwise. Earlier turns are merged for you.
- "under 3000" -> maxPrice 3000. "2k" -> 2000. "1.5 lakh" -> 150000.
- Numeric requirements mean "at least this much" (except weightKg, which means "at most").
- Trade-off language such as "battery matters more than ANC" belongs in priorities.
- If the shopper is only refining an earlier request, use intent "refine_search".`;

export async function extractIntent(message, previous = emptyRequirements(), history = [], { expecting = null } = {}) {
  // Brand vocabulary comes from the live catalogue, so brands a merchant just
  // added are understood without a code change or a restart.
  const brandIndex = await getBrandIndex().catch(() => ({ brands: [], categoryByBrand: {} }));
  const rules = extractWithRules(message, previous, brandIndex, { expecting });
  if (!isLlmEnabled()) return rules;

  const transcript = history
    .slice(-6)
    .map((m) => `${m.role === 'user' ? 'Shopper' : 'BuyWise'}: ${m.content}`)
    .join('\n');

  const result = await completeJson({
    system: SYSTEM_PROMPT,
    maxTokens: 700,
    prompt: [
      transcript ? `Conversation so far:\n${transcript}\n` : '',
      `Requirements gathered so far: ${JSON.stringify(previous)}`,
      `\nNew shopper message: "${message}"`,
    ].join('\n'),
  });

  if (!result.ok || !result.data) return rules;

  const data = result.data;
  const merged = mergeRequirements(previous, {
    category: normaliseCategory(data.category),
    minPrice: numberOrNull(data.minPrice) ?? rules.requirements.minPrice ?? null,
    maxPrice: numberOrNull(data.maxPrice) ?? rules.requirements.maxPrice ?? null,
    brand: data.brand || null,
    useCase: data.useCase || null,
    requirements: sanitiseRequirements(data.requirements),
    priorities: sanitisePriorities(data.priorities),
  });

  return {
    intent: Object.values(INTENTS).includes(data.intent) ? data.intent : rules.intent,
    requirements: merged,
    reply: typeof data.reply === 'string' ? data.reply : null,
    confidence: 0.95,
    source: result.provider,
  };
}

/* --------------------------------------------------------- LLM sanitisers */

const numberOrNull = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);

function normaliseCategory(value) {
  if (!value) return null;
  const lower = String(value).toLowerCase();
  if (CATEGORY_SYNONYMS[lower]) return lower;
  return extractCategory(lower)?.category || null;
}

function sanitiseRequirements(input) {
  const out = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (!ATTRIBUTES[key]) continue;
    if (ATTRIBUTES[key].type === 'boolean') out[key] = Boolean(value);
    else if (Number.isFinite(Number(value))) out[key] = Number(value);
    else if (value === true) out[key] = true;
  }
  return out;
}

function sanitisePriorities(input) {
  const out = {};
  for (const [key, value] of Object.entries(input || {})) {
    const allowedKey = ATTRIBUTES[key] || key === 'price' || key === 'quality';
    if (allowedKey && ['high', 'medium', 'low'].includes(value)) out[key] = value;
  }
  return out;
}

export { emptyRequirements };
