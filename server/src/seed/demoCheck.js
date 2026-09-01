/**
 * demoCheck.js  -  `node src/seed/demoCheck.js`
 * -----------------------------------------------------------------------------
 * Walks the exact scenarios from the BuyWise brief against a running server and
 * prints what the agent did. Useful as a smoke test and as a demo script.
 */
const BASE = process.env.BASE || 'http://localhost:5050';

const post = async (path, body, token) => {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

const line = (t) => console.log(`\n${'='.repeat(72)}\n${t}\n${'='.repeat(72)}`);
const money = (n) => `INR ${Number(n).toLocaleString('en-IN')}`;

function showRecs(recs) {
  for (const r of recs) {
    console.log(`   #${r.rank} ${r.product.name}  ${money(r.product.price)}  ${r.matchPercent}% (${r.badge})`);
    r.pros.slice(0, 3).forEach((p) => console.log(`        + ${p}`));
    r.cons.slice(0, 2).forEach((c) => console.log(`        - ${c}`));
    if (r.versusBest) console.log(`        vs best: ${r.versusBest}`);
  }
}

async function chat(message, conversationId, token) {
  const { body } = await post('/api/ai/chat', { message, conversationId }, token);
  console.log(`\n> "${message}"`);
  console.log(`  intent: ${body.intent}   actions: [${(body.actions || []).join(', ')}]`);
  console.log(`  requirements: ${JSON.stringify(body.requirements)}`);
  console.log(`  BuyWise: ${String(body.reply || body.error).replace(/\n/g, '\n           ')}`);
  if (body.recommendations?.length) showRecs(body.recommendations);
  return body;
}

async function main() {
  const health = await (await fetch(`${BASE}/api/health`)).json();
  line(`BuyWise demo check  |  db=${health.database}  ai=${health.aiProvider}  pay=${health.payment}`);

  /* -- 1. Sign in ---------------------------------------------------------- */
  const login = await post('/api/auth/login', {
    email: 'shopper@buywise.ai',
    password: 'demo1234',
  });
  if (login.status !== 200) throw new Error(`login failed: ${JSON.stringify(login.body)}`);
  const token = login.body.token;
  console.log(`Signed in as ${login.body.user.name}`);

  /* -- 2. Guided conversation (spec section 18) ---------------------------- */
  line('SCENARIO A  -  the agent asks before it answers');
  let convo = await chat('I need a backpack.', null, token);
  const id = convo.conversationId;
  await chat('Around 2000 rupees.', id, token);
  await chat('For college, and I carry a 15.6 inch laptop.', id, token);
  convo = await chat('Yes, I travel during monsoon so it must be waterproof.', id, token);

  /* -- 3. Agentic refinement (spec section 8) ------------------------------ */
  line('SCENARIO B  -  memory across turns');
  const b = await chat(
    'I need wireless headphones for studying under 3000 with noise cancellation and at least 30 hours battery',
    null,
    token
  );
  await chat('What if I increase my budget to 4000? I want something even better for studying.', b.conversationId, token);

  /* -- 4. Trade-offs (spec section 9) -------------------------------------- */
  line('SCENARIO C  -  changing priorities changes the answer');
  await chat('Actually battery is more important than noise cancellation.', b.conversationId, token);

  /* -- 5. Agent takes an action ------------------------------------------- */
  line('SCENARIO D  -  the agent acts through tools');
  await chat('Add it to my cart', b.conversationId, token);
  await chat('show my cart', b.conversationId, token);

  /* -- 6. Checkout --------------------------------------------------------- */
  line('SCENARIO E  -  checkout and payment');
  const order = await post('/api/payment/create-order', {}, token);
  console.log(`  create-order -> ${order.body.mode} ${order.body.orderId} for ${money(order.body.amount / 100)}`);
  const verify = await post(
    '/api/payment/verify',
    {
      razorpay_order_id: order.body.orderId,
      address: { line1: '12 MG Road', city: 'Pune', pincode: '411001' },
      source: 'ai_agent',
    },
    token
  );
  console.log(`  order placed -> ${verify.body.order?.orderNumber} ${money(verify.body.order?.total)}`);

  /* -- 7. Merchant dashboard (spec section 12) ----------------------------- */
  line('SCENARIO F  -  merchant sees AI-driven growth');
  const merchant = await post('/api/auth/login', {
    email: 'merchant@buywise.ai',
    password: 'demo1234',
  });
  const dash = await fetch(`${BASE}/api/merchant/dashboard`, {
    headers: { authorization: `Bearer ${merchant.body.token}` },
  }).then((r) => r.json());
  const s = dash.stats;
  console.log(`  products ${s.products} | AI searches ${s.aiSearches} | recommendations ${s.aiRecommendations}`);
  console.log(`  AI -> cart ${s.aiAddToCart} | orders ${s.conversions} | AI revenue ${money(s.aiRevenue)} (${s.aiRevenueShare}% of total)`);
  console.log(`  recommendation rate ${s.recommendationRate}%  |  cart rate ${s.cartRate}%`);
  console.log(`  top search: "${s.topSearches[0]?.query || '-'}"`);

  line('All scenarios completed.');
}

main().catch((err) => {
  console.error('\nDemo check failed:', err.message);
  process.exit(1);
});
