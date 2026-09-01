/**
 * recommendationEngine.js
 * -----------------------------------------------------------------------------
 * Requirements + product data + priorities  ->  a ranked, explained shortlist.
 *
 * The scoring model follows the spec (section 6):
 *
 *     Budget fit        25
 *     Key requirements  30   (ANC, waterproof, ...)
 *     Specifications    25   (battery hours, RAM, camera MP, ...)
 *     Use-case fit      20
 *     ------------------------
 *     Total            100
 *
 * Those four weights are then re-balanced by the shopper's stated priorities,
 * so "battery matters more than ANC" genuinely changes the ranking rather than
 * just changing the wording of the answer.
 *
 * Every product also gets a "Why this product?" card: the pros, the caveats,
 * and the per-pillar breakdown - this is what makes the recommendation
 * inspectable instead of magical.
 */
import { ATTRIBUTES, USE_CASES, attributesForCategory } from './knowledgeBase.js';

const BASE_WEIGHTS = { budget: 25, requirements: 30, specs: 25, useCase: 20 };
const PRIORITY_MULTIPLIER = { high: 1.6, medium: 1.0, low: 0.5 };

/* ------------------------------------------------------------------ scoring */

/** Budget: full marks inside budget, a soft slope just outside it. */
function scoreBudget(product, req) {
  const { maxPrice, minPrice } = req;
  // No budget stated: this pillar has nothing to judge, so it is dropped from
  // the total entirely. Scoring it at some fraction would quietly penalise a
  // product for a question the shopper was never asked.
  if (!maxPrice && !minPrice) return { ratio: 1, notApplicable: true };
  if (minPrice && product.price < minPrice) {
    return { ratio: 0.6, note: `Below your ₹${minPrice.toLocaleString('en-IN')} minimum` };
  }
  if (!maxPrice) return { ratio: 1, note: 'Meets your minimum price' };

  if (product.price <= maxPrice) {
    const headroom = (maxPrice - product.price) / maxPrice;
    // Comfortably inside budget is good; suspiciously cheap is not extra good.
    const ratio = 1 - Math.max(0, headroom - 0.45) * 0.35;
    const saved = maxPrice - product.price;
    return {
      ratio,
      note:
        saved > 0
          ? `₹${product.price.toLocaleString('en-IN')} - saves you ₹${saved.toLocaleString('en-IN')} against your budget`
          : `Exactly at your ₹${maxPrice.toLocaleString('en-IN')} budget`,
      positive: true,
    };
  }

  const overBy = (product.price - maxPrice) / maxPrice;
  if (overBy > 0.25) return { ratio: 0, note: `₹${(product.price - maxPrice).toLocaleString('en-IN')} over budget`, blocker: true };
  return {
    ratio: Math.max(0, 1 - overBy * 3),
    note: `Slightly over budget by ₹${(product.price - maxPrice).toLocaleString('en-IN')}`,
  };
}

/** Boolean requirements: does the product have what was asked for? */
function scoreRequirements(product, req, priorities) {
  const wanted = Object.entries(req.requirements || {}).filter(
    ([key, value]) => ATTRIBUTES[key]?.type === 'boolean' && value === true
  );
  if (!wanted.length) return { ratio: 1, hits: [], misses: [], notApplicable: true };

  const hits = [];
  const misses = [];
  let earned = 0;
  let possible = 0;

  for (const [key] of wanted) {
    const attr = ATTRIBUTES[key];
    const weight = attr.weight * PRIORITY_MULTIPLIER[priorities[key] || 'medium'];
    possible += weight;
    if (product.features?.[key]) {
      earned += weight;
      hits.push(attr.label);
    } else {
      misses.push(attr.label);
    }
  }
  return { ratio: possible ? earned / possible : 1, hits, misses };
}

/** Numeric specs: "at least 30 hours" style thresholds, with credit for exceeding. */
function scoreSpecs(product, req, priorities) {
  const wanted = Object.entries(req.requirements || {}).filter(
    ([key, value]) => ATTRIBUTES[key]?.type === 'numeric' && typeof value === 'number'
  );
  if (!wanted.length) return { ratio: 1, hits: [], misses: [], notApplicable: true };

  const hits = [];
  const misses = [];
  let earned = 0;
  let possible = 0;

  for (const [key, target] of wanted) {
    const attr = ATTRIBUTES[key];
    const actual = Number(product.features?.[key]);
    const weight = attr.weight * PRIORITY_MULTIPLIER[priorities[key] || 'medium'];
    possible += weight;

    if (!Number.isFinite(actual)) {
      misses.push(`${attr.label} not specified`);
      continue;
    }

    const lowerIsBetter = attr.direction === 'lower';
    const meets = lowerIsBetter ? actual <= target : actual >= target;

    if (meets) {
      // Clearing the bar earns most of the marks; the rest is awarded in
      // proportion to how comfortably it clears, so a product with 35 hours of
      // battery genuinely outranks one with 32 when you asked for 30.
      const overshoot = lowerIsBetter ? (target - actual) / target : (actual - target) / target;
      earned += weight * (0.85 + 0.15 * Math.min(1, overshoot / 0.5));
      hits.push(
        `${attr.label}: ${formatValue(actual, attr)}${
          overshoot > 0.05 ? ` (you asked for ${formatValue(target, attr)})` : ''
        }`
      );
    } else {
      const shortfall = lowerIsBetter ? actual / target : actual / target;
      earned += weight * Math.max(0, shortfall * 0.6);
      misses.push(
        `${attr.label} is ${formatValue(actual, attr)}, you wanted ${formatValue(target, attr)}`
      );
    }
  }
  return { ratio: possible ? Math.min(1, earned / possible) : 1, hits, misses };
}

/** Use-case fit: does the merchant profile say this suits what you're doing? */
function scoreUseCase(product, req) {
  if (!req.useCase) return { ratio: 1, hits: [], misses: [], notApplicable: true };

  const useCase = req.useCase;
  const direct = (product.useCases || []).map((u) => u.toLowerCase());
  if (direct.includes(useCase)) {
    return { ratio: 1, hits: [`Built for ${useCase}`], positive: true };
  }

  // Fall back to the vocabulary: does its text mention related words?
  const words = USE_CASES[useCase] || [useCase];
  const text = `${product.searchText || ''} ${direct.join(' ')}`;
  const overlap = words.filter((w) => text.includes(w)).length;
  if (overlap >= 2) return { ratio: 0.85, hits: [`Suits ${useCase} use`] };
  if (overlap === 1) return { ratio: 0.65, hits: [] };
  return { ratio: 0.35, hits: [], misses: [`Not specifically designed for ${useCase}`] };
}

function formatValue(value, attr) {
  if (attr.unit === 'score') return `${value}/10`;
  if (attr.unit === 'inch') return `${value}"`;
  return `${value} ${attr.unit || ''}`.trim();
}

/**
 * Turn the shopper's priorities into pillar weights.
 * A "high" priority on a spec attribute pushes weight toward that pillar.
 */
function computeWeights(req, applicable) {
  const weights = { ...BASE_WEIGHTS };
  const priorities = req.priorities || {};

  for (const [key, level] of Object.entries(priorities)) {
    const multiplier = PRIORITY_MULTIPLIER[level] || 1;
    if (key === 'price') weights.budget *= multiplier;
    else if (key === 'quality') {
      weights.specs *= multiplier;
      weights.budget *= 0.7;
    } else if (ATTRIBUTES[key]) {
      const pillar = ATTRIBUTES[key].type === 'boolean' ? 'requirements' : 'specs';
      weights[pillar] *= multiplier;
    }
  }

  // Drop pillars with nothing to judge and share their weight among the rest,
  // so the score always means "out of what you actually told me". This is what
  // keeps 100% reachable and stops an unmentioned criterion costing marks.
  for (const key of Object.keys(weights)) {
    if (!applicable[key]) weights[key] = 0;
  }

  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  if (total === 0) return { budget: 0, requirements: 0, specs: 0, useCase: 0 };

  // Normalise to 95, leaving 5 points of the 100 for social proof below.
  return Object.fromEntries(Object.entries(weights).map(([k, v]) => [k, (v / total) * 95]));
}

/* -------------------------------------------------------------- the ranking */

export function scoreProduct(product, requirements) {
  const priorities = requirements.priorities || {};

  const budget = scoreBudget(product, requirements);
  const reqs = scoreRequirements(product, requirements, priorities);
  const specs = scoreSpecs(product, requirements, priorities);
  const useCase = scoreUseCase(product, requirements);

  const applicable = {
    budget: !budget.notApplicable,
    requirements: !reqs.notApplicable,
    specs: !specs.notApplicable,
    useCase: !useCase.notApplicable,
  };
  const statedAnything = Object.values(applicable).some(Boolean);
  const weights = computeWeights(requirements, applicable);

  // Only pillars we can actually judge appear in the breakdown - showing a
  // "Budget fit 0/0" row would be noise, and scoring it would be a lie.
  const breakdown = [
    { key: 'budget', pillar: 'Budget fit', ratio: budget.ratio },
    { key: 'requirements', pillar: 'Must-have features', ratio: reqs.ratio },
    { key: 'specs', pillar: 'Specifications', ratio: specs.ratio },
    { key: 'useCase', pillar: 'Suitability', ratio: useCase.ratio },
  ]
    .filter((row) => applicable[row.key])
    .map((row) => ({
      pillar: row.pillar,
      earned: Math.round(row.ratio * weights[row.key] * 10) / 10,
      max: Math.round(weights[row.key] * 10) / 10,
    }));

  const ratingRatio = Math.max(0, Math.min(1, (product.rating - 3.5) / 1.5));

  if (!statedAnything) {
    // Nothing to match against yet. Rank on general merit and say so, rather
    // than printing a "match %" for requirements that were never given.
    const value = product.mrp > product.price ? (product.mrp - product.price) / product.mrp : 0;
    const generalScore = Math.round((product.rating / 5) * 80 + Math.min(1, value / 0.4) * 20);
    const generalBreakdown = [
      { pillar: 'Buyer rating', earned: Math.round((product.rating / 5) * 80 * 10) / 10, max: 80 },
      { pillar: 'Value for money', earned: Math.round(Math.min(1, value / 0.4) * 20 * 10) / 10, max: 20 },
    ];
    return {
      score: Math.max(0, Math.min(100, product.stock <= 0 ? generalScore - 25 : generalScore)),
      basis: 'general',
      breakdown: generalBreakdown,
      pros: buildPros({ budget, reqs, specs, useCase, product }),
      cons: buildCons({ budget, reqs, specs, useCase, product }),
      outOfBudget: false,
    };
  }

  // The remaining 5 points are social proof, so a well-reviewed product edges
  // out an identical one nobody has bought.
  breakdown.push({
    pillar: 'Buyer rating',
    earned: Math.round(ratingRatio * 5 * 10) / 10,
    max: 5,
  });

  let total = breakdown.reduce((sum, row) => sum + row.earned, 0);
  if (product.stock <= 0) total -= 25;
  if (budget.blocker) total = Math.min(total, 45);

  return {
    score: Math.max(0, Math.min(100, Math.round(total))),
    basis: 'requirements',
    breakdown,
    pros: buildPros({ budget, reqs, specs, useCase, product }),
    cons: buildCons({ budget, reqs, specs, useCase, product }),
    outOfBudget: Boolean(budget.blocker),
  };
}

function buildPros({ budget, reqs, specs, useCase, product }) {
  const pros = [];
  if (budget.positive) pros.push(budget.note);
  pros.push(...reqs.hits);
  pros.push(...specs.hits);
  pros.push(...(useCase.hits || []));
  if (product.rating >= 4.3) pros.push(`Well rated: ${product.rating}/5 from ${product.ratingCount} buyers`);
  if (!pros.length && product.highlights?.length) pros.push(product.highlights[0]);
  return pros.slice(0, 5);
}

function buildCons({ budget, reqs, specs, useCase, product }) {
  const cons = [];
  if (budget.note && !budget.positive && !budget.notApplicable) cons.push(budget.note);
  cons.push(...(reqs.misses || []).map((m) => `No ${m.toLowerCase()}`));
  cons.push(...(specs.misses || []));
  cons.push(...(useCase.misses || []));
  if (product.stock <= 0) cons.push('Currently out of stock');
  return cons.slice(0, 4);
}

/**
 * Rank a candidate list and attach explainability cards.
 * Returns the shortlist the agent will talk about.
 */
export function rankProducts(products, requirements, { limit = 4 } = {}) {
  const scored = products
    .map((product) => {
      const evaluation = scoreProduct(product, requirements);
      return { product, ...evaluation };
    })
    .sort((a, b) => b.score - a.score);

  const shortlist = scored.slice(0, limit);
  const best = shortlist[0];

  return shortlist.map((entry, index) => ({
    product: entry.product,
    score: entry.score,
    matchPercent: entry.score,
    basis: entry.basis,
    rank: index + 1,
    badge: index === 0 ? 'Best match' : index === 1 ? 'Runner-up' : 'Alternative',
    pros: entry.pros,
    cons: entry.cons,
    breakdown: entry.breakdown,
    // A one-line comparison against the winner makes the trade-off obvious.
    versusBest:
      index === 0
        ? null
        : compareToBest(entry, best),
  }));
}

function compareToBest(entry, best) {
  const parts = [];
  const diff = best.product.price - entry.product.price;
  if (diff > 0) parts.push(`₹${diff.toLocaleString('en-IN')} cheaper`);
  else if (diff < 0) parts.push(`₹${Math.abs(diff).toLocaleString('en-IN')} more expensive`);

  const gap = best.score - entry.score;
  if (gap > 0) parts.push(`${gap} point${gap === 1 ? '' : 's'} behind on your requirements`);
  return parts.join(', ') || 'Very close on every measure';
}
