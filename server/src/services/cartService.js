/**
 * cartService.js
 * -----------------------------------------------------------------------------
 * Cart operations, used identically by the normal UI buttons and by the agent's
 * cart tool. The agent never writes to the database itself - it asks for this
 * function to run (spec section 16), which is what keeps the LLM out of the
 * data layer.
 */
import { COLLECTIONS, getCollection } from '../db/index.js';
import { EVENT_TYPES, createCart } from '../models/schemas.js';
import { track } from './analyticsService.js';
import { getProductById } from './productService.js';

async function loadOrCreate(userId) {
  const carts = getCollection(COLLECTIONS.CARTS);
  const existing = await carts.findOne({ userId });
  if (existing) return existing;
  const cart = createCart(userId);
  await carts.insertOne(cart);
  return cart;
}

const withTotals = (cart) => {
  const subtotal = cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const shipping = subtotal > 0 && subtotal < 500 ? 49 : 0;
  return {
    ...cart,
    subtotal,
    shipping,
    total: subtotal + shipping,
    count: cart.items.reduce((sum, i) => sum + i.quantity, 0),
  };
};

export async function getCart(userId) {
  return withTotals(await loadOrCreate(userId));
}

export async function addToCart(userId, productId, quantity = 1, { byAgent = false } = {}) {
  const product = await getProductById(productId);
  if (!product) throw Object.assign(new Error('Product not found'), { status: 404 });
  if (product.stock <= 0) throw Object.assign(new Error('That product is out of stock'), { status: 409 });

  const cart = await loadOrCreate(userId);
  const existing = cart.items.find((i) => i.productId === productId);

  if (existing) existing.quantity += quantity;
  else {
    cart.items.push({
      productId,
      name: product.name,
      brand: product.brand,
      category: product.category, // the UI draws its category mark from this
      price: product.price,
      image: product.image,
      quantity,
      merchantId: product.merchantId,
      addedByAgent: byAgent,
    });
  }

  await getCollection(COLLECTIONS.CARTS).updateOne(
    { _id: cart._id },
    { $set: { items: cart.items, updatedAt: new Date().toISOString() } }
  );

  await track({
    type: byAgent ? EVENT_TYPES.AI_ADD_TO_CART : EVENT_TYPES.ADD_TO_CART,
    merchantId: product.merchantId,
    productId,
    userId,
    value: product.price * quantity,
  });

  return withTotals(cart);
}

export async function updateQuantity(userId, productId, quantity) {
  const cart = await loadOrCreate(userId);
  const item = cart.items.find((i) => i.productId === productId);
  if (!item) throw Object.assign(new Error('That item is not in your cart'), { status: 404 });

  if (quantity <= 0) cart.items = cart.items.filter((i) => i.productId !== productId);
  else item.quantity = quantity;

  await getCollection(COLLECTIONS.CARTS).updateOne(
    { _id: cart._id },
    { $set: { items: cart.items, updatedAt: new Date().toISOString() } }
  );
  return withTotals(cart);
}

export async function removeFromCart(userId, productId) {
  return updateQuantity(userId, productId, 0);
}

export async function clearCart(userId) {
  const cart = await loadOrCreate(userId);
  await getCollection(COLLECTIONS.CARTS).updateOne(
    { _id: cart._id },
    { $set: { items: [], updatedAt: new Date().toISOString() } }
  );
  return withTotals({ ...cart, items: [] });
}
