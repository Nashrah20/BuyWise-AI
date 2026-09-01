/**
 * seed.js
 * -----------------------------------------------------------------------------
 * Fills an empty catalogue so the demo has something to reason about, and
 * creates two sign-in-ready accounts:
 *
 *   shopper@buywise.ai  / demo1234   (customer)
 *   merchant@buywise.ai / demo1234   (merchant, owns the catalogue)
 *
 * Runs automatically on boot when the database is empty, or manually with
 * `npm run seed` (which wipes and rebuilds the demo data).
 */
import bcrypt from 'bcryptjs';
import { COLLECTIONS, connectDatabase, getCollection } from '../db/index.js';
import { ROLES, createProduct, createUser } from '../models/schemas.js';
import { DEMO_PRODUCTS } from './catalog.js';

const DEMO_PASSWORD = 'demo1234';

async function ensureDemoUsers() {
  const users = getCollection(COLLECTIONS.USERS);
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  let merchant = await users.findOne({ email: 'merchant@buywise.ai' });
  if (!merchant) {
    merchant = createUser({
      name: 'Anika Rao',
      email: 'merchant@buywise.ai',
      passwordHash,
      role: ROLES.MERCHANT,
      storeName: 'Rao Electronics & Bags',
    });
    await users.insertOne(merchant);
  }

  if (!(await users.findOne({ email: 'shopper@buywise.ai' }))) {
    await users.insertOne(
      createUser({
        name: 'Demo Shopper',
        email: 'shopper@buywise.ai',
        passwordHash,
        role: ROLES.CUSTOMER,
      })
    );
  }
  return merchant;
}

export async function seedProducts({ force = false } = {}) {
  const products = getCollection(COLLECTIONS.PRODUCTS);
  const existing = await products.countDocuments({});
  if (existing > 0 && !force) return 0;
  if (force) await products.deleteMany({});

  const merchant = await ensureDemoUsers();
  const docs = DEMO_PRODUCTS.map((p) =>
    createProduct({
      ...p,
      stock: 10 + Math.floor(Math.random() * 40),
      merchantId: merchant._id,
      merchantName: merchant.storeName,
      aiProfileGeneratedBy: 'seed',
    })
  );

  await products.insertMany(docs);
  return docs.length;
}

/** Called on server boot. */
export async function seedIfEmpty() {
  await ensureDemoUsers();
  return seedProducts({ force: false });
}

/* Direct execution: `npm run seed` */
const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('seed/seed.js');
if (invokedDirectly) {
  (async () => {
    await connectDatabase();
    const count = await seedProducts({ force: true });
    console.log(`\n  Seeded ${count} products.`);
    console.log('  Sign in with:');
    console.log(`    shopper@buywise.ai  / ${DEMO_PASSWORD}`);
    console.log(`    merchant@buywise.ai / ${DEMO_PASSWORD}\n`);
    process.exit(0);
  })();
}
