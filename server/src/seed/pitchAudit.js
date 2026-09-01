/**
 * pitchAudit.js  -  node src/seed/pitchAudit.js
 * -----------------------------------------------------------------------------
 * Checks the running platform against every claim in the BuyWise pitch, using
 * the exact sentences from the script. Anything that does not behave as the
 * pitch says is printed as a GAP.
 */
const BASE = process.env.BASE || 'http://localhost:5050';

const post = (path, body, token) =>
  fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  }).then((r) => r.json());

const gaps = [];
const check = (label, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'GAP '} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) gaps.push(`${label}${detail ? ` — ${detail}` : ''}`);
};

async function main() {
  const login = await post('/api/auth/login', { email: 'shopper@buywise.ai', password: 'demo1234' });
  const token = login.token;
  let cid = null;

  const say = async (message) => {
    const r = await post('/api/ai/chat', { message, conversationId: cid }, token);
    cid = r.conversationId;
    return r;
  };

  /* ---- 1. the opening example, verbatim from the pitch ------------------ */
  console.log('\n1. Opening example (verbatim)');
  cid = null;
  let r = await say(
    'I need a backpack for college, under ₹2,000. It should be waterproof, fit my 15-inch laptop, and be comfortable because I travel every day.'
  );
  const q = r.requirements;
  check('category = backpack', q.category === 'backpack', q.category);
  check('budget = 2000', q.maxPrice === 2000, q.maxPrice);
  check('use case captured', ['college', 'travel'].includes(q.useCase), q.useCase);
  check('waterproof required', q.requirements.waterproof === true, JSON.stringify(q.requirements));
  check('15-inch laptop size captured', q.requirements.laptopCompartment === 15, `got ${q.requirements.laptopCompartment}`);
  check('produced recommendations', (r.recommendations || []).length > 0, `${r.recommendations?.length || 0}`);

  /* ---- 2. the headphones example --------------------------------------- */
  console.log('\n2. Headphones example (verbatim)');
  cid = null;
  r = await say(
    'I need wireless headphones for studying, under ₹3,000, with good noise cancellation and at least 30 hours of battery.'
  );
  const h = r.requirements;
  check('category = headphones', h.category === 'headphones', h.category);
  check('budget = 3000', h.maxPrice === 3000, h.maxPrice);
  check('use case = study', h.useCase === 'study', h.useCase);
  check('ANC required', h.requirements.anc === true);
  check('battery >= 30', h.requirements.battery === 30, `got ${h.requirements.battery}`);
  const top = r.recommendations?.[0];
  check('top pick scored', top && top.matchPercent > 0, top && `${top.product.name} ${top.matchPercent}%`);
  check('explanation mentions why', /budget|noise|battery/i.test(r.reply));

  /* ---- 3. agentic: budget AND priority change in ONE sentence ----------- */
  console.log('\n3. Agentic change (budget + priority in one message)');
  r = await say('What if I increase my budget to ₹4,000? I care more about battery life than noise cancellation now.');
  const a = r.requirements;
  check('budget updated to 4000', a.maxPrice === 4000, a.maxPrice);
  check('earlier requirements kept', a.category === 'headphones' && a.requirements.anc === true);
  check('battery priority raised', a.priorities.battery === 'high', JSON.stringify(a.priorities));
  check('re-ranked', (r.recommendations || []).length > 0);

  /* ---- 4. conversational shopping -------------------------------------- */
  console.log('\n4. Conversational shopping');
  r = await say('Show me something cheaper');
  check('"cheaper" lowers the budget', r.requirements.maxPrice < 4000, `maxPrice ${r.requirements.maxPrice}`);

  r = await say('What about Samsung?');
  check('brand switch understood', r.requirements.brand === 'samsung' || /samsung/i.test(r.reply), `brand ${r.requirements.brand}`);

  r = await say('Compare the top two');
  check('comparison produced', (r.comparison || []).length >= 2, `${r.comparison?.length || 0} compared`);

  /* ---- 5. recommendation -> purchase ----------------------------------- */
  console.log('\n5. Recommendation to purchase');
  cid = null;
  await say('wireless headphones for studying under 3000 with noise cancellation');
  r = await say("I'll buy this one");
  check('"I\'ll buy this one" adds to cart', (r.actions || []).includes('add_to_cart'), JSON.stringify(r.actions));

  r = await say('checkout');
  check('checkout prepared', (r.actions || []).includes('checkout_summary'), JSON.stringify(r.actions));
  check('checkout hands off to the page', Boolean(r.checkoutReady), `checkoutReady=${r.checkoutReady}`);

  /* ---- 6. merchant side ------------------------------------------------ */
  console.log('\n6. Merchant side');
  const merchant = await post('/api/auth/login', { email: 'merchant@buywise.ai', password: 'demo1234' });
  const mt = merchant.token;

  const profile = await post(
    '/api/merchant/generate-profile',
    { name: 'College Backpack', price: 1499, description: 'Waterproof backpack with laptop compartment and anti-theft pocket.' },
    mt
  );
  const p = profile.profile;
  check('AI profile: category', p?.category === 'backpack', p?.category);
  check('AI profile: use cases', (p?.useCases || []).length > 0, (p?.useCases || []).join('/'));
  check('AI profile: features', Object.keys(p?.features || {}).length >= 2, JSON.stringify(p?.features));
  check('AI profile: suitable for', (p?.suitableFor || []).length > 0, (p?.suitableFor || []).join('/'));

  const dash = await fetch(`${BASE}/api/merchant/dashboard`, { headers: { authorization: `Bearer ${mt}` } }).then((x) => x.json());
  const s = dash.stats;
  console.log('\n7. Merchant analytics (the funnel from the pitch)');
  check('AI searches tracked', typeof s.aiSearches === 'number', s.aiSearches);
  check('recommendations tracked', typeof s.aiRecommendations === 'number', s.aiRecommendations);
  check('cart additions tracked', typeof s.aiAddToCart === 'number', s.aiAddToCart);
  check('purchases tracked', typeof s.aiConversions === 'number', s.aiConversions);
  check('revenue attribution', typeof s.aiRevenue === 'number', s.aiRevenue);
  check('top searches (what customers ask)', Array.isArray(s.topSearches), `${s.topSearches?.length} entries`);
  check('most recommended products', Array.isArray(s.topProducts), `${s.topProducts?.length} entries`);
  check('unmet demand (requested but not stocked)', Array.isArray(s.unmetDemand), s.unmetDemand ? `${s.unmetDemand.length} entries` : 'MISSING');

  /* ---- 8. user profile / preferences ----------------------------------- */
  console.log('\n8. Customer preferences (agent long-term memory)');
  const prefs = await fetch(`${BASE}/api/auth/me`, { headers: { authorization: `Bearer ${token}` } }).then((x) => x.json());
  check('preferences stored on the user', Boolean(prefs.user?.preferences));

  console.log(`\n${'='.repeat(66)}`);
  if (gaps.length) {
    console.log(`${gaps.length} GAP(S):`);
    gaps.forEach((g) => console.log(`  - ${g}`));
    process.exit(1);
  }
  console.log('Everything in the pitch is implemented and behaving as described.');
}

main().catch((e) => {
  console.error('audit failed:', e.message);
  process.exit(1);
});
