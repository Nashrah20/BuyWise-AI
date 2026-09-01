import cors from 'cors';
import express from 'express';
import morgan from 'morgan';
import { config, isRazorpayLive } from './config/env.js';
import { connectDatabase, getDriverName } from './db/index.js';
import { attachUser } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/errors.js';
import aiRoutes from './routes/ai.js';
import authRoutes from './routes/auth.js';
import cartRoutes from './routes/cart.js';
import merchantRoutes from './routes/merchant.js';
import orderRoutes from './routes/orders.js';
import paymentRoutes from './routes/payment.js';
import productRoutes from './routes/products.js';
import { recommendationsRouter, searchRouter } from './routes/search.js';
import { activeProvider } from './services/llm/index.js';
import { seedIfEmpty } from './seed/seed.js';

const app = express();

app.use(cors({ origin: [config.clientUrl, 'http://localhost:5173', 'http://localhost:4173'] }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));
app.use(attachUser);

app.get('/api/health', (_req, res) =>
  res.json({
    status: 'ok',
    database: getDriverName(),
    aiProvider: activeProvider(),
    payment: isRazorpayLive ? 'razorpay_test' : 'demo',
  })
);

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/search', searchRouter);
app.use('/api/recommendations', recommendationsRouter);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/merchant', merchantRoutes);

app.use(notFound);
app.use(errorHandler);

async function start() {
  console.log('\n  BuyWise AI - backend');
  console.log('  ' + '-'.repeat(58));
  await connectDatabase();
  const seeded = await seedIfEmpty();
  if (seeded) console.log(`  Catalogue : seeded ${seeded} demo products`);

  const provider = activeProvider();
  console.log(
    `  AI engine : ${provider === 'rules' ? 'built-in rule engine (set an API key for LLM reasoning)' : provider}`
  );
  console.log(`  Payment   : ${isRazorpayLive ? 'Razorpay sandbox' : 'demo simulator'}`);

  app.listen(config.port, () => {
    console.log(`  Listening : http://localhost:${config.port}`);
    console.log('  ' + '-'.repeat(58) + '\n');
  });
}

start().catch((err) => {
  console.error('Failed to start BuyWise:', err);
  process.exit(1);
});
