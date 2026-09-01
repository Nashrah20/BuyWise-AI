/**
 * agent/tools.js
 * -----------------------------------------------------------------------------
 * The only actions the agent is allowed to take.
 *
 * This is the safety boundary described in spec section 16: the LLM never
 * touches MongoDB, the cart or payments. It can only say "I would like to run
 * search_products with these arguments", and the backend decides whether to
 * run it and how. Adding a capability means adding a tool here - nothing else
 * in the system grows a new way for the model to reach the database.
 */
import { COLLECTIONS, getCollection } from '../db/index.js';
import { EVENT_TYPES } from '../models/schemas.js';
import { track } from '../services/analyticsService.js';
import * as cartService from '../services/cartService.js';
import { getProductById, searchProducts } from '../services/productService.js';
import { rankProducts } from '../services/recommendationEngine.js';

export const TOOL_DEFINITIONS = [
  {
    name: 'search_products',
    description: 'Find and rank products matching the current structured requirements.',
    args: ['requirements'],
  },
  {
    name: 'add_to_cart',
    description: 'Put a specific product in the shopper cart.',
    args: ['productId', 'quantity'],
  },
  { name: 'view_cart', description: 'Read back what is in the cart.', args: [] },
  {
    name: 'compare_products',
    description: 'Score two or more named products against the requirements side by side.',
    args: ['productIds', 'requirements'],
  },
  { name: 'get_profile', description: 'Read the shopper saved preferences.', args: [] },
  { name: 'checkout_summary', description: 'Prepare an order summary for checkout.', args: [] },
];

/**
 * Run one tool. `ctx` carries the authenticated user and conversation so tools
 * can record analytics without the model ever seeing internal ids it shouldn't.
 */
export async function runTool(name, args, ctx) {
  const tool = TOOLS[name];
  if (!tool) return { ok: false, error: `Unknown tool: ${name}` };
  try {
    return { ok: true, name, result: await tool(args, ctx) };
  } catch (err) {
    return { ok: false, name, error: err.message };
  }
}

/**
 * Write the analytics trail for one agent search.
 *
 * Three levels, because merchants and the platform care about different things:
 *   ai_search          once, platform-wide - "how much traffic does the agent handle?"
 *   ai_search_matched  once per merchant surfaced - "how many of those did MY catalogue answer?"
 *   ai_recommendation  once per shortlisted product - "which of my products does it pick?"
 */
export async function recordSearchEvents({ ranked, requirements, userId, message }) {
  await track({
    type: EVENT_TYPES.AI_SEARCH,
    userId,
    query: message,
    merchantId: null,
    meta: { category: requirements.category, maxPrice: requirements.maxPrice },
  });

  // A search nobody could answer well is demand a merchant could capture.
  // Recorded platform-wide so every merchant can see the opportunity.
  const bestScore = ranked[0]?.score ?? 0;
  if (!ranked.length || bestScore < 60) {
    await track({
      type: EVENT_TYPES.AI_SEARCH_UNMET,
      merchantId: null,
      userId,
      query: message,
      value: bestScore,
      meta: {
        category: requirements.category,
        maxPrice: requirements.maxPrice,
        useCase: requirements.useCase,
        wanted: Object.keys(requirements.requirements || {}),
      },
    });
  }

  const merchantsSurfaced = [...new Set(ranked.map((r) => r.product.merchantId).filter(Boolean))];
  await Promise.all(
    merchantsSurfaced.map((merchantId) =>
      track({ type: EVENT_TYPES.AI_SEARCH_MATCHED, merchantId, userId, query: message })
    )
  );

  await Promise.all(
    ranked.map((entry) =>
      track({
        type: EVENT_TYPES.AI_RECOMMENDATION,
        userId,
        productId: entry.product._id,
        merchantId: entry.product.merchantId,
        query: message,
        value: entry.product.price,
        meta: { rank: entry.rank, score: entry.score },
      })
    )
  );
}

const TOOLS = {
  async search_products({ requirements }, ctx) {
    const { products, relaxed } = await searchProducts(requirements);
    const ranked = rankProducts(products, requirements, { limit: 4 });

    await recordSearchEvents({ ranked, requirements, userId: ctx.userId, message: ctx.message });

    return {
      recommendations: ranked,
      totalCandidates: products.length,
      relaxed,
    };
  },

  async add_to_cart({ productId, quantity = 1 }, ctx) {
    if (!ctx.userId) throw new Error('Please sign in first so I can save items to your cart.');
    const cart = await cartService.addToCart(ctx.userId, productId, quantity, { byAgent: true });
    const product = await getProductById(productId);
    return { cart, product };
  },

  async view_cart(_args, ctx) {
    if (!ctx.userId) throw new Error('Sign in to see your cart.');
    return { cart: await cartService.getCart(ctx.userId) };
  },

  async compare_products({ productIds, requirements }) {
    const products = await getCollection(COLLECTIONS.PRODUCTS).find({ _id: { $in: productIds } });
    return { comparison: rankProducts(products, requirements, { limit: products.length }) };
  },

  async get_profile(_args, ctx) {
    if (!ctx.userId) return { profile: null };
    const user = await getCollection(COLLECTIONS.USERS).findOne(
      { _id: ctx.userId },
      { projection: { passwordHash: 0 } }
    );
    return { profile: user?.preferences || null };
  },

  async checkout_summary(_args, ctx) {
    if (!ctx.userId) throw new Error('Sign in to check out.');
    const cart = await cartService.getCart(ctx.userId);
    return {
      cart,
      readyForCheckout: cart.items.length > 0,
      message: cart.items.length
        ? `Your cart has ${cart.count} item(s) totalling ₹${cart.total.toLocaleString('en-IN')}.`
        : 'Your cart is empty right now.',
    };
  },
};
