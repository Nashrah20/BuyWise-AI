/**
 * analyticsService.js
 * -----------------------------------------------------------------------------
 * The business-growth half of the project (spec sections 12 and 19).
 *
 * Every agent action writes one event. The merchant dashboard then answers the
 * question a real merchant actually cares about: how much of my revenue did the
 * AI produce? The funnel is:
 *
 *     AI search -> AI recommendation -> AI added to cart -> order
 */
import { COLLECTIONS, getCollection } from '../db/index.js';
import { EVENT_TYPES, createEvent } from '../models/schemas.js';

export async function track(event) {
  try {
    await getCollection(COLLECTIONS.EVENTS).insertOne(createEvent(event));
  } catch (err) {
    // Analytics must never break a shopper's request.
    console.warn('[analytics]', err.message);
  }
}

export async function trackMany(events) {
  await Promise.all(events.map(track));
}

/** Aggregate the dashboard for one merchant, or for the whole platform. */
export async function merchantDashboard(merchantId) {
  const events = getCollection(COLLECTIONS.EVENTS);
  const products = getCollection(COLLECTIONS.PRODUCTS);

  // Read everything once: platform totals are needed alongside this merchant's
  // slice so we can express "share of AI searches your catalogue answered".
  const [productCount, everything] = await Promise.all([
    products.countDocuments(merchantId ? { merchantId } : {}),
    events.find({}, { limit: 100000 }),
  ]);

  const all = merchantId ? everything.filter((e) => e.merchantId === merchantId) : everything;
  const countOf = (type) => all.filter((e) => e.type === type).length;

  const platformSearches = everything.filter((e) => e.type === EVENT_TYPES.AI_SEARCH).length;
  // Searches this merchant's catalogue was able to answer.
  const aiSearches = merchantId ? countOf(EVENT_TYPES.AI_SEARCH_MATCHED) : platformSearches;
  const aiRecommendations = countOf(EVENT_TYPES.AI_RECOMMENDATION);
  const aiAddToCart = countOf(EVENT_TYPES.AI_ADD_TO_CART);
  const orderEvents = all.filter((e) => e.type === EVENT_TYPES.ORDER);
  const aiOrders = orderEvents.filter((e) => e.meta?.source === 'ai_agent');

  const revenue = orderEvents.reduce((sum, e) => sum + (e.value || 0), 0);
  const aiRevenue = aiOrders.reduce((sum, e) => sum + (e.value || 0), 0);

  // The language real shoppers used in searches this catalogue answered.
  const searchType = merchantId ? EVENT_TYPES.AI_SEARCH_MATCHED : EVENT_TYPES.AI_SEARCH;
  const queryCounts = new Map();
  for (const e of all) {
    if (e.type === searchType && e.query) {
      queryCounts.set(e.query, (queryCounts.get(e.query) || 0) + 1);
    }
  }
  const topSearches = [...queryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([query, count]) => ({ query, count }));

  // Which of my products does the agent actually recommend?
  const recCounts = new Map();
  for (const e of all) {
    if (e.type === EVENT_TYPES.AI_RECOMMENDATION && e.productId) {
      recCounts.set(e.productId, (recCounts.get(e.productId) || 0) + 1);
    }
  }
  const topIds = [...recCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topProductDocs = topIds.length
    ? await products.find({ _id: { $in: topIds.map(([id]) => id) } })
    : [];
  const topProducts = topIds.map(([id, count]) => {
    const doc = topProductDocs.find((p) => p._id === id);
    return { productId: id, name: doc?.name || 'Removed product', price: doc?.price || 0, count };
  });

  /**
   * Demand nobody could serve: searches where the catalogue had no good answer.
   * This is the "what are customers asking for that I don't sell?" view - the
   * insight that lets a merchant act on the data instead of just admiring it.
   */
  const unmetCounts = new Map();
  for (const e of everything) {
    if (e.type !== EVENT_TYPES.AI_SEARCH_UNMET || !e.query) continue;
    const key = e.query.toLowerCase();
    const row = unmetCounts.get(key) || {
      query: e.query,
      count: 0,
      category: e.meta?.category || null,
      maxPrice: e.meta?.maxPrice || null,
      wanted: e.meta?.wanted || [],
    };
    row.count += 1;
    unmetCounts.set(key, row);
  }
  const unmetDemand = [...unmetCounts.values()].sort((a, b) => b.count - a.count).slice(0, 6);

  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

  return {
    products: productCount,
    aiSearches,
    platformSearches,
    aiRecommendations,
    aiAddToCart,
    conversions: orderEvents.length,
    aiConversions: aiOrders.length,
    revenue,
    aiRevenue,
    aiRevenueShare: pct(aiRevenue, revenue),
    // Share of all agent searches that your catalogue was able to answer.
    recommendationRate: merchantId ? pct(aiSearches, platformSearches) : 100,
    cartRate: pct(aiAddToCart, aiSearches),
    conversionRate: pct(aiOrders.length, aiAddToCart),
    topSearches,
    topProducts,
    unmetDemand,
    funnel: [
      { stage: 'AI searches', value: aiSearches },
      { stage: 'Recommendations', value: aiRecommendations },
      { stage: 'Added to cart', value: aiAddToCart },
      { stage: 'Purchased', value: aiOrders.length },
    ],
  };
}
