/**
 * routes/merchant.js
 * -----------------------------------------------------------------------------
 * The merchant half of the platform (spec sections 11 and 12).
 *
 * The interesting endpoint is POST /generate-profile: a merchant pastes an
 * ordinary listing and gets back the AI Commerce Profile before saving, so they
 * can see - and correct - exactly what the shopping agent will understand.
 */
import { Router } from 'express';
import { COLLECTIONS, getCollection } from '../db/index.js';
import { requireMerchant } from '../middleware/auth.js';
import { asyncRoute } from '../middleware/errors.js';
import { CATEGORIES, buildSearchText, createProduct } from '../models/schemas.js';
import { merchantDashboard } from '../services/analyticsService.js';
import { generateProductProfile } from '../services/productProfileService.js';
import { invalidateBrandCache } from '../services/productService.js';

const router = Router();
router.use(requireMerchant);

router.get(
  '/dashboard',
  asyncRoute(async (req, res) => res.json({ stats: await merchantDashboard(req.user._id) }))
);

router.get(
  '/products',
  asyncRoute(async (req, res) => {
    const products = await getCollection(COLLECTIONS.PRODUCTS).find(
      { merchantId: req.user._id },
      { sort: { createdAt: -1 } }
    );
    res.json({ products });
  })
);

/** Preview the AI Commerce Profile without saving anything. */
router.post(
  '/generate-profile',
  asyncRoute(async (req, res) => {
    const { name, description, price, category } = req.body;
    if (!name) return res.status(400).json({ error: 'A product name is required.' });
    const profile = await generateProductProfile({
      name,
      description: description || '',
      price: Number(price) || 0,
      category,
    });
    return res.json({ profile });
  })
);

router.post(
  '/products',
  asyncRoute(async (req, res) => {
    const { name, price, description, brand, image, stock, category, profile } = req.body;
    if (!name || !price) return res.status(400).json({ error: 'Name and price are required.' });

    // Use the profile the merchant just reviewed, or generate one now.
    const aiProfile =
      profile && profile.category
        ? profile
        : await generateProductProfile({ name, description, price, category });

    const product = createProduct({
      name,
      price: Number(price),
      mrp: Number(req.body.mrp || price),
      description,
      brand,
      image,
      stock: Number(stock ?? 25),
      category: CATEGORIES.includes(aiProfile.category) ? aiProfile.category : 'headphones',
      features: aiProfile.features,
      useCases: aiProfile.useCases,
      suitableFor: aiProfile.suitableFor,
      highlights: aiProfile.highlights,
      tags: aiProfile.tags,
      aiProfileGeneratedBy: aiProfile.generatedBy,
      merchantId: req.user._id,
      merchantName: req.user.storeName || req.user.name,
    });

    await getCollection(COLLECTIONS.PRODUCTS).insertOne(product);
    invalidateBrandCache();
    return res.status(201).json({ product });
  })
);

router.put(
  '/products/:id',
  asyncRoute(async (req, res) => {
    const products = getCollection(COLLECTIONS.PRODUCTS);
    const existing = await products.findOne({ _id: req.params.id, merchantId: req.user._id });
    if (!existing) return res.status(404).json({ error: 'Product not found in your store.' });

    const merged = { ...existing, ...req.body, _id: existing._id, merchantId: existing.merchantId };
    merged.price = Number(merged.price);
    merged.stock = Number(merged.stock);
    merged.searchText = buildSearchText(merged);
    merged.updatedAt = new Date().toISOString();

    await products.updateOne({ _id: existing._id }, { $set: merged });
    invalidateBrandCache();
    return res.json({ product: merged });
  })
);

router.delete(
  '/products/:id',
  asyncRoute(async (req, res) => {
    const result = await getCollection(COLLECTIONS.PRODUCTS).deleteOne({
      _id: req.params.id,
      merchantId: req.user._id,
    });
    if (!result.deletedCount) return res.status(404).json({ error: 'Product not found in your store.' });
    invalidateBrandCache();
    return res.json({ ok: true });
  })
);

export default router;
