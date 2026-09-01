/**
 * smoke.mjs - drive the real UI in a real browser.
 *
 * Walks the shopper journey and the merchant journey, failing on any console
 * error or unhandled rejection. Run with both dev servers up:
 *   node smoke.mjs
 */
import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:5173';
const SHOTS = process.env.SHOTS || './shots';

const problems = [];

async function main() {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1360, height: 1000 },
  });

  const page = await browser.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));

  const go = async (path, label, wait = 1200) => {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((r) => setTimeout(r, wait));
    await page.screenshot({ path: `${SHOTS}/${label}.png`, fullPage: true });
    const heading = await page.$eval('h1', (el) => el.textContent).catch(() => '(no h1)');
    console.log(`  ${path.padEnd(22)} -> "${heading.trim().slice(0, 52)}"`);
  };

  console.log('\nSHOPPER JOURNEY');
  await go('/', '01-home');

  // Ask the agent a full requirement and wait for recommendation cards.
  await page.goto(`${BASE}/agent`, { waitUntil: 'networkidle2' });
  await page.type(
    '#agent-input',
    'I need wireless headphones for studying under 3000 with noise cancellation and at least 30 hours battery'
  );
  await page.keyboard.press('Enter');
  await page.waitForSelector('article', { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 900));
  await page.screenshot({ path: `${SHOTS}/02-agent-recommendations.png`, fullPage: true });

  const cards = await page.$$eval('article', (els) => els.length);
  const score = await page
    .$eval('article svg + div span', (el) => el.textContent)
    .catch(() => '?');
  console.log(`  /agent                 -> ${cards} recommendation cards, top score ${score}`);
  if (cards === 0) problems.push('agent produced no recommendation cards');

  // Expand the scoring breakdown - the explainability feature.
  const expand = await page.$x?.('//button[contains(., "See how this score")]');
  const btn = await page.evaluateHandle(() =>
    [...document.querySelectorAll('button')].find((b) => b.textContent.includes('See how this score'))
  );
  if (btn && (await btn.evaluate((n) => !!n))) {
    await btn.click();
    await new Promise((r) => setTimeout(r, 500));
    await page.screenshot({ path: `${SHOTS}/03-why-this-product.png`, fullPage: true });
    console.log('  score breakdown        -> expanded ok');
  } else {
    problems.push('could not find the score-breakdown toggle');
  }

  // Follow-up turn: the agentic memory test.
  await page.type('#agent-input', 'What if I increase my budget to 4000?');
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 2500));
  await page.screenshot({ path: `${SHOTS}/04-agent-refined.png`, fullPage: true });
  const budgetShown = await page.evaluate(() => document.body.innerText.includes('4,000'));
  console.log(`  follow-up turn         -> budget updated in panel: ${budgetShown}`);
  if (!budgetShown) problems.push('refined budget not reflected in the requirement panel');

  await go('/shop', '05-shop');
  await go('/shop?category=backpack', '06-shop-category');

  // A product page, via the first card link.
  const productHref = await page
    .$$eval('a[href^="/product/"]', (els) => els[0]?.getAttribute('href'))
    .catch(() => null);
  if (productHref) await go(productHref, '07-product-detail');
  else problems.push('no product links found on the shop page');

  console.log('\nAUTH + CART');
  await page.goto(`${BASE}/signin`, { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: `${SHOTS}/08-signin.png`, fullPage: true });

  // Sign in with the demo shopper button.
  const shopperBtn = await page.evaluateHandle(() =>
    [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Demo shopper'))
  );
  await shopperBtn.click();
  await new Promise((r) => setTimeout(r, 2500));
  console.log(`  signed in              -> now at ${new URL(page.url()).pathname}`);

  // Add something to the cart from the shop, then view the cart.
  await page.goto(`${BASE}/shop`, { waitUntil: 'networkidle2' });
  const addBtn = await page.evaluateHandle(() =>
    [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add to cart')
  );
  await addBtn.click();
  await new Promise((r) => setTimeout(r, 1400));
  await go('/cart', '09-cart');
  const cartHasItem = await page.evaluate(() => !!document.querySelector('li .font-display'));
  console.log(`  cart has an item       -> ${cartHasItem}`);
  if (!cartHasItem) problems.push('cart appears empty after adding a product');

  await go('/checkout', '10-checkout');

  console.log('\nMERCHANT JOURNEY');
  // Sign out, then in as the merchant.
  await page.goto(`${BASE}/signin`, { waitUntil: 'networkidle2' });
  await page.evaluate(() => localStorage.removeItem('buywise_token'));
  await page.goto(`${BASE}/signin`, { waitUntil: 'networkidle2' });
  const merchantBtn = await page.evaluateHandle(() =>
    [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Demo merchant'))
  );
  await merchantBtn.click();
  await new Promise((r) => setTimeout(r, 2600));
  await page.screenshot({ path: `${SHOTS}/11-merchant-dashboard.png`, fullPage: true });
  const funnelShown = await page.evaluate(() => document.body.innerText.includes('AI sales funnel'));
  console.log(`  /merchant              -> funnel rendered: ${funnelShown}`);
  if (!funnelShown) problems.push('merchant dashboard funnel did not render');

  await go('/merchant/products', '12-merchant-products');

  // The AI Commerce Profile generator.
  await page.goto(`${BASE}/merchant/new`, { waitUntil: 'networkidle2' });
  const exampleBtn = await page.evaluateHandle(() =>
    [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Fill in an example'))
  );
  await exampleBtn.click();
  await new Promise((r) => setTimeout(r, 300));
  const genBtn = await page.evaluateHandle(() =>
    [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Generate AI profile'))
  );
  await genBtn.click();
  await new Promise((r) => setTimeout(r, 2000));
  await page.screenshot({ path: `${SHOTS}/13-ai-profile.png`, fullPage: true });
  const profileShown = await page.evaluate(() => document.body.innerText.includes('waterproof'));
  console.log(`  /merchant/new          -> profile generated: ${profileShown}`);
  if (!profileShown) problems.push('AI commerce profile did not render');

  // Mobile viewport check.
  await page.setViewport({ width: 390, height: 850 });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: `${SHOTS}/14-mobile-home.png`, fullPage: true });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1
  );
  console.log(`\n  mobile horizontal overflow -> ${overflow ? 'YES (problem)' : 'no'}`);
  if (overflow) problems.push('page scrolls horizontally on a 390px viewport');

  await browser.close();

  console.log(`\n${'='.repeat(60)}`);
  if (problems.length) {
    console.log(`${problems.length} problem(s):`);
    problems.forEach((p) => console.log(`  - ${p}`));
    process.exit(1);
  }
  console.log('All UI checks passed.');
}

main().catch((err) => {
  console.error('smoke run failed:', err.message);
  process.exit(1);
});
