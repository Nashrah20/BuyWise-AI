/**
 * db/index.js
 * -----------------------------------------------------------------------------
 * The single data-access point for the whole backend.
 *
 * Every route and service asks for a collection through `getCollection(name)`
 * and then uses ordinary MongoDB calls (find / insertOne / updateOne / ...).
 * Which engine answers those calls depends only on configuration:
 *
 *   MONGO_URI set    -> real MongoDB (Atlas or local) via the official driver
 *   MONGO_URI empty  -> the built-in file-backed engine, so `npm run dev`
 *                       works on a laptop with nothing installed
 *
 * Because both engines speak the same query language, no application code
 * changes when you move the demo onto Atlas.
 */
import { MongoClient } from 'mongodb';
import { config } from '../config/env.js';
import { MemoryStore } from './memoryEngine.js';

export const COLLECTIONS = {
  USERS: 'users',
  PRODUCTS: 'products',
  CARTS: 'carts',
  ORDERS: 'orders',
  CONVERSATIONS: 'conversations',
  MERCHANTS: 'merchants',
  RECOMMENDATIONS: 'recommendations',
  EVENTS: 'events',
};

const state = {
  driver: null, // 'mongodb' | 'memory'
  client: null,
  db: null,
  memory: null,
};

export async function connectDatabase() {
  if (state.driver) return state;

  if (config.mongoUri) {
    try {
      const client = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
      await client.connect();
      state.client = client;
      state.db = client.db(config.mongoDbName);
      state.driver = 'mongodb';
      await ensureIndexes();
      console.log(`  Database  : MongoDB (${config.mongoDbName})`);
      return state;
    } catch (err) {
      console.warn(`  Database  : MongoDB unreachable (${err.message})`);
      console.warn('              falling back to the built-in store.');
    }
  }

  state.memory = new MemoryStore();
  state.driver = 'memory';
  console.log('  Database  : built-in file store (server/.data) - set MONGO_URI for Atlas');
  return state;
}

/** Indexes that matter for product search. No-op on the memory engine. */
async function ensureIndexes() {
  const products = state.db.collection(COLLECTIONS.PRODUCTS);
  await Promise.all([
    products.createIndex({ category: 1, price: 1 }),
    products.createIndex({ searchText: 'text', name: 'text' }),
    state.db.collection(COLLECTIONS.USERS).createIndex({ email: 1 }, { unique: true }),
    state.db.collection(COLLECTIONS.EVENTS).createIndex({ merchantId: 1, type: 1, createdAt: -1 }),
  ]).catch(() => {});
}

export function getCollection(name) {
  if (!state.driver) throw new Error('connectDatabase() must run before getCollection()');
  return state.driver === 'mongodb' ? state.db.collection(name) : state.memory.collection(name);
}

export const getDriverName = () => state.driver;

export async function closeDatabase() {
  if (state.client) await state.client.close();
}
