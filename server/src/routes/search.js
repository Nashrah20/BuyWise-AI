/**
 * routes/search.js  +  routes/recommendations.js
 * -----------------------------------------------------------------------------
 * The two non-conversational entry points from spec section 14.
 *
 *   /api/search           classic filtered catalogue search
 *   /api/recommendations  score an explicit requirement object (no LLM needed),
 *                         which is how the "Why this product?" panel can be
 *                         re-run when the shopper drags a priority slider
 */
import { Router } from 'express';
import { COLLECTIONS, getCollection } from '../db/index.js';
import { asyncRoute } from '../middleware/errors.js';
import { emptyRequirements, mergeRequirements } from '../services/intentService.js';
import { browseProducts, searchProducts } from '../services/productService.js';
import { rankProducts } from '../services/recommendationEngine.js';

export const searchRouter = Router();

searchRouter.get(
  '/',
  asyncRoute(async (req, res) => {
    const { items, total } = await browseProducts(req.query);
    res.json({ items, total });
  })
);

export const recommendationsRouter = Router();

/** Score a requirement object directly - the deterministic core of the engine. */
recommendationsRouter.post(
  '/',
  asyncRoute(async (req, res) => {
    const requirements = mergeRequirements(emptyRequirements(), req.body.requirements || {});
    const { products, relaxed } = await searchProducts(requirements);
    const recommendations = rankProducts(products, requirements, {
      limit: Number(req.body.limit) || 5,
    });
    res.json({ requirements, recommendations, relaxed, totalCandidates: products.length });
  })
);

/** What the agent last recommended in a conversation. */
recommendationsRouter.get(
  '/conversation/:id',
  asyncRoute(async (req, res) => {
    const records = await getCollection(COLLECTIONS.RECOMMENDATIONS).find(
      { conversationId: req.params.id },
      { sort: { createdAt: -1 }, limit: 10 }
    );
    res.json({ records });
  })
);
