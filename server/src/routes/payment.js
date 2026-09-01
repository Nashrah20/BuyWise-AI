/**
 * routes/payment.js
 * -----------------------------------------------------------------------------
 * Razorpay in sandbox mode when keys are configured, and a clearly-labelled
 * demo simulator when they are not - so the checkout journey can be walked
 * end to end during a demo without any account setup.
 *
 * The LLM has no reach into this file. Payment is triggered by the user
 * pressing a button in the checkout UI, never by the agent (spec section 16).
 */
import crypto from 'crypto';
import { Router } from 'express';
import { config, isRazorpayLive } from '../config/env.js';
import { COLLECTIONS, getCollection } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncRoute } from '../middleware/errors.js';
import { EVENT_TYPES, createOrder } from '../models/schemas.js';
import { track } from '../services/analyticsService.js';
import * as cartService from '../services/cartService.js';

const router = Router();

let razorpayClient = null;
async function getRazorpay() {
  if (!isRazorpayLive) return null;
  if (!razorpayClient) {
    const { default: Razorpay } = await import('razorpay');
    razorpayClient = new Razorpay({
      key_id: config.razorpay.keyId,
      key_secret: config.razorpay.keySecret,
    });
  }
  return razorpayClient;
}

router.get('/config', (_req, res) => {
  res.json({
    mode: isRazorpayLive ? 'razorpay_test' : 'demo',
    keyId: isRazorpayLive ? config.razorpay.keyId : null,
    note: isRazorpayLive
      ? 'Razorpay sandbox is live. Use Razorpay test cards.'
      : 'Demo mode: no real payment gateway is called and no money moves.',
  });
});

/** Step 1 - create the payment order for the current cart. */
router.post(
  '/create-order',
  requireAuth,
  asyncRoute(async (req, res) => {
    const cart = await cartService.getCart(req.user._id);
    if (!cart.items.length) return res.status(400).json({ error: 'Your cart is empty.' });

    const amountPaise = Math.round(cart.total * 100);
    const razorpay = await getRazorpay();

    if (razorpay) {
      const order = await razorpay.orders.create({
        amount: amountPaise,
        currency: 'INR',
        receipt: `bw_${Date.now()}`,
      });
      return res.json({
        mode: 'razorpay_test',
        keyId: config.razorpay.keyId,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
      });
    }

    return res.json({
      mode: 'demo',
      orderId: `demo_order_${crypto.randomBytes(6).toString('hex')}`,
      amount: amountPaise,
      currency: 'INR',
    });
  })
);

/** Step 2 - verify payment, then turn the cart into a real order. */
router.post(
  '/verify',
  requireAuth,
  asyncRoute(async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, address, source } = req.body;

    if (isRazorpayLive) {
      const expected = crypto
        .createHmac('sha256', config.razorpay.keySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');
      if (expected !== razorpay_signature) {
        return res.status(400).json({ error: 'Payment could not be verified.' });
      }
    }

    const cart = await cartService.getCart(req.user._id);
    if (!cart.items.length) return res.status(400).json({ error: 'Your cart is empty.' });

    const order = createOrder({
      userId: req.user._id,
      items: cart.items,
      total: cart.total,
      address: address || {},
      source: source === 'ai_agent' ? 'ai_agent' : 'manual',
      payment: {
        method: isRazorpayLive ? 'razorpay_test' : 'demo',
        status: 'paid',
        razorpayOrderId: razorpay_order_id || null,
        paymentId: razorpay_payment_id || `demo_pay_${crypto.randomBytes(6).toString('hex')}`,
      },
    });

    await getCollection(COLLECTIONS.ORDERS).insertOne(order);

    // Attribute revenue back to each merchant, flagging AI-driven purchases.
    const drivenByAgent = order.items.some((i) => i.addedByAgent) || order.source === 'ai_agent';
    await Promise.all(
      order.items.map((item) =>
        track({
          type: EVENT_TYPES.ORDER,
          merchantId: item.merchantId,
          productId: item.productId,
          userId: req.user._id,
          value: item.price * item.quantity,
          meta: { source: drivenByAgent ? 'ai_agent' : 'manual', orderId: order._id },
        })
      )
    );

    // Reduce stock, then empty the cart.
    const products = getCollection(COLLECTIONS.PRODUCTS);
    await Promise.all(
      order.items.map((item) =>
        products.updateOne({ _id: item.productId }, { $inc: { stock: -item.quantity } })
      )
    );
    await cartService.clearCart(req.user._id);

    return res.status(201).json({ order });
  })
);

export default router;
