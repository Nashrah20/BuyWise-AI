import { Router } from 'express';
import { COLLECTIONS, getCollection } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncRoute } from '../middleware/errors.js';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  asyncRoute(async (req, res) => {
    const orders = await getCollection(COLLECTIONS.ORDERS).find(
      { userId: req.user._id },
      { sort: { createdAt: -1 }, limit: 50 }
    );
    res.json({ orders });
  })
);

router.get(
  '/:id',
  asyncRoute(async (req, res) => {
    const order = await getCollection(COLLECTIONS.ORDERS).findOne({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    return res.json({ order });
  })
);

export default router;
