import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncRoute } from '../middleware/errors.js';
import * as cartService from '../services/cartService.js';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  asyncRoute(async (req, res) => res.json({ cart: await cartService.getCart(req.user._id) }))
);

router.post(
  '/',
  asyncRoute(async (req, res) => {
    const { productId, quantity = 1, byAgent = false } = req.body;
    if (!productId) return res.status(400).json({ error: 'productId is required.' });
    const cart = await cartService.addToCart(req.user._id, productId, Number(quantity), { byAgent });
    return res.json({ cart });
  })
);

router.put(
  '/:productId',
  asyncRoute(async (req, res) => {
    const cart = await cartService.updateQuantity(
      req.user._id,
      req.params.productId,
      Number(req.body.quantity)
    );
    res.json({ cart });
  })
);

router.delete(
  '/:productId',
  asyncRoute(async (req, res) => {
    res.json({ cart: await cartService.removeFromCart(req.user._id, req.params.productId) });
  })
);

router.delete(
  '/',
  asyncRoute(async (req, res) => res.json({ cart: await cartService.clearCart(req.user._id) }))
);

export default router;
