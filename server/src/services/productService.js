/**
 * productService.js
 * -----------------------------------------------------------------------------
 * Turns structured requirements into a MongoDB query, then widens the net if
 * that query was too strict. The agent should never answer "nothing found"
 * when a slightly relaxed search would have produced a sensible shortlist.
 */
import { COLLECTIONS, getCollection } from '../db/index.js';
import { ATTRIBUTES } from './knowledgeBase.js';

/** Build the strict query implied by the requirements. */
export function buildQuery(req, { strict = true } = {}) {
  const query = {};
  const and = [];

  if (req.category) query.category = req.category;
  if (req.brand) query.brand = { $regex: req.brand, $options: 'i' };

  const price = {};
  if (req.minPrice) price.$gte = req.minPrice;
  if (req.maxPrice) price.$lte = strict ? req.maxPrice : Math.round(req.maxPrice * 1.25);
  if (Object.keys(price).length) query.price = price;

  if (strict) {
    for (const [key, value] of Object.entries(req.requirements || {})) {
      const attr = ATTRIBUTES[key];
      if (!attr) continue;
      if (attr.type === 'boolean' && value === true) {
        and.push({ [`features.${key}`]: true });
      } else if (attr.type === 'numeric' && typeof value === 'number') {
        and.push({
          [`features.${key}`]: attr.direction === 'lower' ? { $lte: value } : { $gte: value },
        });
      }
    }
  }

  if (and.length) query.$and = and;
  return query;
}

/**
 * Gather candidates, then let the recommendation engine do the judging.
 *
 * We deliberately do NOT hard-filter on every requirement. A backpack that is
 * perfect except for one missing feature is exactly what the shopper should see
 * ranked second with an honest caveat - that comparison is the product. The
 * strict query is still evaluated, but only to report whether anything matched
 * the brief completely, which the agent mentions in its answer.
 */
export async function searchProducts(requirements, { limit = 40 } = {}) {
  const products = getCollection(COLLECTIONS.PRODUCTS);

  // No category, but the shopper named something ("Vivo Y16 Pro"). Match the
  // name against the catalogue before falling back to a generic browse -
  // otherwise we would rank all 27 products on nothing and look clueless.
  if (!requirements.category && requirements.freeText) {
    const terms = String(requirements.freeText)
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => ({ searchText: { $regex: escapeRegex(t), $options: 'i' } }));

    if (terms.length) {
      const matches = await products.find({ $or: terms }, { limit });
      if (matches.length) return { products: matches, relaxed: 'category' };
    }
    // Nothing resembles it. Say so rather than inventing a shortlist.
    return { products: [], relaxed: 'none' };
  }

  const attempts = [
    // Right category, roughly the right price - scoring handles the rest.
    { query: buildQuery(requirements, { strict: false }), relaxed: null },
    // Nothing near the budget: show the closest options and say so.
    { query: requirements.category ? { category: requirements.category } : {}, relaxed: 'budget' },
  ];

  for (const attempt of attempts) {
    const results = await products.find(attempt.query, { limit, sort: { price: 1 } });
    if (!results.length) continue;

    if (attempt.relaxed === null) {
      // Did anything satisfy every stated requirement?
      const strict = await products.find(buildQuery(requirements, { strict: true }), { limit: 1 });
      return { products: results, relaxed: strict.length ? null : 'features' };
    }
    return { products: results, relaxed: attempt.relaxed };
  }

  // Last resort: free text across the AI commerce profile.
  const text = requirements.freeText || requirements.useCase;
  if (text) {
    const results = await products.find(
      { searchText: { $regex: escapeRegex(text), $options: 'i' } },
      { limit }
    );
    if (results.length) return { products: results, relaxed: 'category' };
  }
  return { products: [], relaxed: 'none' };
}

export const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ------------------------------------------------------------------- brands */

/**
 * The brands actually on the shelves.
 *
 * Brand recognition must come from the catalogue, not a hardcoded list -
 * otherwise a merchant adds "Vivo" and the agent keeps insisting it doesn't
 * stock Vivo. Cached briefly because it is consulted on every message.
 */
const brandCache = { brands: [], categoryByBrand: {}, at: 0 };
const BRAND_TTL_MS = 30_000;

/**
 * Returns the brand vocabulary AND the category each brand sells into, so a
 * shopper naming an unfamiliar brand ("the Zephyrix Air 50") still gets a
 * category without anyone hardcoding that brand anywhere.
 */
export async function getBrandIndex() {
  if (brandCache.brands.length && Date.now() - brandCache.at < BRAND_TTL_MS) {
    return brandCache;
  }

  const rows = await getCollection(COLLECTIONS.PRODUCTS).find(
    {},
    { projection: { brand: 1, category: 1 }, limit: 5000 }
  );

  // Count categories per brand and keep the dominant one.
  const tally = new Map();
  for (const row of rows) {
    if (typeof row.brand !== 'string' || row.brand.trim().length < 2) continue;
    const brand = row.brand.trim().toLowerCase();
    if (!tally.has(brand)) tally.set(brand, new Map());
    const counts = tally.get(brand);
    counts.set(row.category, (counts.get(row.category) || 0) + 1);
  }

  brandCache.brands = [...tally.keys()];
  brandCache.categoryByBrand = Object.fromEntries(
    [...tally.entries()].map(([brand, counts]) => [
      brand,
      [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0],
    ])
  );
  brandCache.at = Date.now();
  return brandCache;
}

/** Called when a merchant changes their catalogue, so new brands work at once. */
export function invalidateBrandCache() {
  brandCache.at = 0;
}

/** Do we stock anything from this brand? Asked of the catalogue, not a shortlist. */
export async function catalogueHasBrand(brand) {
  if (!brand) return false;
  const count = await getCollection(COLLECTIONS.PRODUCTS).countDocuments({
    brand: { $regex: `^${escapeRegex(brand)}$`, $options: 'i' },
  });
  if (count > 0) return true;
  // Also count a brand that only appears in the product name.
  const byName = await getCollection(COLLECTIONS.PRODUCTS).countDocuments({
    searchText: { $regex: escapeRegex(brand), $options: 'i' },
  });
  return byName > 0;
}

/** The plain catalogue browse used by the Shop page. */
export async function browseProducts({ q, category, minPrice, maxPrice, sort, limit = 60, skip = 0 }) {
  const query = {};
  if (category) query.category = category;
  if (q) query.searchText = { $regex: escapeRegex(q), $options: 'i' };
  const price = {};
  if (minPrice) price.$gte = Number(minPrice);
  if (maxPrice) price.$lte = Number(maxPrice);
  if (Object.keys(price).length) query.price = price;

  const sortMap = {
    price_asc: { price: 1 },
    price_desc: { price: -1 },
    rating: { rating: -1 },
    newest: { createdAt: -1 },
  };

  const collection = getCollection(COLLECTIONS.PRODUCTS);
  const [items, total] = await Promise.all([
    collection.find(query, { sort: sortMap[sort] || { rating: -1 }, limit: Number(limit), skip: Number(skip) }),
    collection.countDocuments(query),
  ]);
  return { items, total };
}

export async function getProductById(id) {
  return getCollection(COLLECTIONS.PRODUCTS).findOne({ _id: id });
}

export async function getProductsByIds(ids) {
  if (!ids?.length) return [];
  return getCollection(COLLECTIONS.PRODUCTS).find({ _id: { $in: ids } });
}
