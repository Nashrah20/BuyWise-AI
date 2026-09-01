/**
 * schemas.js
 * -----------------------------------------------------------------------------
 * Document shapes for every BuyWise collection, in one readable place, plus
 * the small factory functions used to create them. These are the "AI-readable"
 * product records that make intent matching possible.
 */
import { newId } from '../utils/id.js';

/* ---------------------------------------------------------------- constants */

export const ROLES = { CUSTOMER: 'customer', MERCHANT: 'merchant' };

export const CATEGORIES = [
  'headphones',
  'backpack',
  'laptop',
  'smartphone',
  'smartwatch',
  'keyboard',
  'monitor',
  'speaker',
];

/** Priority weights used by the recommendation engine (section 9 of the spec). */
export const PRIORITY_LEVELS = { high: 3, medium: 2, low: 1 };

export const EVENT_TYPES = {
  /** One per agent search, platform-wide (merchantId is null by design). */
  AI_SEARCH: 'ai_search',
  /** One per merchant whose product surfaced in that search - this is what
   *  lets a merchant see "how many AI searches did my catalogue answer?" */
  AI_SEARCH_MATCHED: 'ai_search_matched',
  AI_RECOMMENDATION: 'ai_recommendation',
  /** A search the catalogue could not answer well - demand nobody captured. */
  AI_SEARCH_UNMET: 'ai_search_unmet',
  AI_ADD_TO_CART: 'ai_add_to_cart',
  ADD_TO_CART: 'add_to_cart',
  ORDER: 'order',
  PRODUCT_VIEW: 'product_view',
};

/* ----------------------------------------------------------------- factories */

export function createUser({ name, email, passwordHash, role = ROLES.CUSTOMER, storeName }) {
  return {
    _id: newId(),
    name,
    email: email.toLowerCase(),
    passwordHash,
    role,
    storeName: role === ROLES.MERCHANT ? storeName || `${name}'s Store` : undefined,
    // The user profile the agent consults (spec section 16: "User Profile" tool).
    preferences: {
      budgetRange: null,
      favouriteCategories: [],
      priorities: {},
      notes: [],
    },
    createdAt: new Date().toISOString(),
  };
}

/**
 * The AI Commerce Profile. A normal catalogue stores name/price/description;
 * BuyWise additionally stores structured, machine-readable meaning so the
 * agent can reason about a product instead of keyword-matching it.
 */
export function createProduct(input) {
  const now = new Date().toISOString();
  return {
    _id: input._id || newId(),
    name: input.name,
    brand: input.brand || 'Generic',
    price: Number(input.price),
    mrp: Number(input.mrp || input.price),
    currency: 'INR',
    category: input.category,
    description: input.description || '',
    image: input.image || '',
    stock: Number.isFinite(input.stock) ? input.stock : 25,
    rating: Number(input.rating || 4.0),
    ratingCount: Number(input.ratingCount || 0),

    // ---- AI commerce metadata -------------------------------------------
    features: input.features || {}, // structured specs: { anc: true, battery: 35 }
    highlights: input.highlights || [], // human-readable bullets
    useCases: input.useCases || [], // ["study", "travel"]
    suitableFor: input.suitableFor || [], // ["students", "office workers"]
    tags: input.tags || [],
    searchText: buildSearchText(input),
    aiProfileGeneratedBy: input.aiProfileGeneratedBy || 'manual',

    merchantId: input.merchantId || null,
    merchantName: input.merchantName || 'BuyWise Marketplace',
    createdAt: input.createdAt || now,
    updatedAt: now,
  };
}

export function buildSearchText(product) {
  const featureWords = Object.entries(product.features || {})
    .filter(([, v]) => v !== false && v !== null && v !== undefined)
    .map(([k, v]) => (v === true ? k : `${k} ${v}`));
  return [
    product.name,
    product.brand,
    product.category,
    product.description,
    ...(product.highlights || []),
    ...(product.useCases || []),
    ...(product.suitableFor || []),
    ...(product.tags || []),
    ...featureWords,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function createCart(userId) {
  return {
    _id: newId(),
    userId,
    items: [], // { productId, name, price, image, quantity, addedByAgent }
    updatedAt: new Date().toISOString(),
  };
}

export function createOrder({ userId, items, total, address, payment, source }) {
  return {
    _id: newId(),
    orderNumber: `BW${Date.now().toString().slice(-8)}`,
    userId,
    items,
    total,
    address,
    payment, // { method, status, razorpayOrderId, paymentId }
    source: source || 'manual', // 'ai_agent' when the agent drove the purchase
    status: 'confirmed',
    createdAt: new Date().toISOString(),
  };
}

/**
 * A conversation is the agent's memory. Storing `requirements` alongside the
 * transcript is what makes follow-ups like "increase my budget to 4000" work
 * without the shopper repeating themselves (spec section 8).
 */
export function createConversation(userId) {
  return {
    _id: newId(),
    userId: userId || null,
    messages: [], // { role, content, createdAt, recommendations? }
    requirements: {
      category: null,
      minPrice: null,
      maxPrice: null,
      brand: null,
      useCase: null,
      requirements: {},
      priorities: {},
    },
    lastRecommendations: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** One analytics row. The merchant dashboard is built entirely from these. */
export function createEvent({ type, merchantId, productId, userId, query, value, meta }) {
  return {
    _id: newId(),
    type,
    merchantId: merchantId || null,
    productId: productId || null,
    userId: userId || null,
    query: query || null,
    value: value || 0,
    meta: meta || {},
    createdAt: new Date().toISOString(),
  };
}

export function createRecommendationRecord({ userId, conversationId, query, requirements, results }) {
  return {
    _id: newId(),
    userId: userId || null,
    conversationId: conversationId || null,
    query,
    requirements,
    results, // [{ productId, score, matchPercent }]
    createdAt: new Date().toISOString(),
  };
}
