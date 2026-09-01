import { Router } from 'express';
import { COLLECTIONS, getCollection } from '../db/index.js';
import { asyncRoute } from '../middleware/errors.js';
import { CATEGORIES, EVENT_TYPES } from '../models/schemas.js';
import { track } from '../services/analyticsService.js';
import { browseProducts, getProductById } from '../services/productService.js';

const router = Router();

router.get(
  '/',
  asyncRoute(async (req, res) => {
    const { items, total } = await browseProducts(req.query);
    res.json({ items, total });
  })
);

router.get(
  '/categories',
  asyncRoute(async (_req, res) => {
    const products = getCollection(COLLECTIONS.PRODUCTS);
    const counts = await Promise.all(
      CATEGORIES.map(async (category) => ({
        category,
        count: await products.countDocuments({ category }),
      }))
    );
    res.json({ categories: counts.filter((c) => c.count > 0) });
  })
);

router.get(
  '/:id',
  asyncRoute(async (req, res) => {
    const product = await getProductById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    await track({
      type: EVENT_TYPES.PRODUCT_VIEW,
      productId: product._id,
      merchantId: product.merchantId,
      userId: req.user?._id,
    });
    return res.json({ product });
  })
);

export default router;
