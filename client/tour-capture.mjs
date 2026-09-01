/**
 * tour-capture.mjs - capture every screen of BuyWise for the guided tour.
 *
 * Drives the real app in a real browser and saves compressed JPEGs into
 * ./tour. Run with both dev servers up:  node tour-capture.mjs
 */
import fs from 'fs';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:5173';
const OUT = './tour';

const W = 1180;
const H = 760;

fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars'],
    defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
  });
  const page = await browser.newPage();

  const shot = async (name, { full = false } = {}) => {
    await wait(450);
    await page.screenshot({
      path: `${OUT}/${name}.jpg`,
      type: 'jpeg',
      quality: 62,
      fullPage: full,
    });
    const kb = Math.round(fs.statSync(`${OUT}/${name}.jpg`).size / 1024);
    console.log(`  ${name}.jpg  (${kb} KB)`);
  };

  const go = async (path) => {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2', timeout: 30000 });
    await wait(700);
  };

  const ask = async (text, settle = 2600) => {
    await page.waitForSelector('#agent-input');
    await page.type('#agent-input', text);
    await page.keyboard.press('Enter');
    await wait(settle);
  };

  const clickText = async (needle) => {
    const handle = await page.evaluateHandle(
      (n) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(n)),
      needle
    );
    if (await handle.evaluate((n) => !!n)) {
      await handle.click();
      await wait(900);
      return true;
    }
    return false;
  };

  console.log('\nCapturing tour screens...');

  /* ---------------------------------------------------------- 1. landing */
  await go('/');
  await shot('01-home-hero');
  await page.evaluate(() => window.scrollBy(0, 780));
  await shot('02-home-problem');
  await page.evaluate(() => window.scrollBy(0, 900));
  await shot('03-home-howitworks');

  /* ------------------------------------------------------------ 2. agent */
  await go('/agent');
  await page.evaluate(() => localStorage.removeItem('buywise_conversation'));
  await page.reload({ waitUntil: 'networkidle2' });
  await wait(900);
  await shot('04-agent-empty');

  // The guided-question flow: too little information -> ask, don't guess.
  await ask('I need a backpack');
  await shot('05-agent-asks');

  await ask('Around 2000 rupees');
  await ask('For college, and I carry a 15.6 inch laptop');
  await ask('Yes, I travel during monsoon so it must be waterproof');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await wait(600);
  await shot('06-agent-recommendations');

  // Explainability: the actual arithmetic behind the score.
  await clickText('See how this score was calculated');
  await shot('07-agent-why');

  /* ------------------------------- 3. memory + trade-offs (new headphones) */
  await go('/agent');
  await clickText('Start a new search');
  await ask('I need wireless headphones for studying under 3000 with noise cancellation and at least 30 hours battery');
  await page.evaluate(() => window.scrollTo(0, 260));
  await shot('08-agent-headphones');

  await ask('What if I increase my budget to 4000?');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await wait(500);
  await shot('09-agent-memory');

  await ask('Actually battery is more important than noise cancellation');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await wait(500);
  await shot('10-agent-tradeoff');

  // The agent taking an action through a tool.
  await ask('Add it to my cart');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await shot('11-agent-addtocart');

  /* ------------------------------------------------------------ 4. browse */
  await go('/shop');
  await shot('12-shop');

  const href = await page
    .$$eval('a[href^="/product/"]', (els) => els[0]?.getAttribute('href'))
    .catch(() => null);
  if (href) {
    await go(href);
    await shot('13-product-top');
    await page.evaluate(() => window.scrollBy(0, 700));
    await shot('14-product-aiprofile');
  }

  /* -------------------------------------------------- 5. cart -> checkout */
  await go('/cart');
  await shot('15-cart');
  await go('/checkout');
  await shot('16-checkout');
  await go('/orders');
  await shot('17-orders');

  /* ---------------------------------------------------------- 6. sign in */
  await go('/signin');
  await shot('18-signin');

  /* --------------------------------------------------------- 7. merchant */
  await page.evaluate(() => localStorage.removeItem('buywise_token'));
  await go('/signin');
  await clickText('Demo merchant');
  await wait(2200);
  await go('/merchant');
  await shot('19-merchant-dashboard');
  await page.evaluate(() => window.scrollBy(0, 420));
  await shot('20-merchant-funnel');

  await go('/merchant/new');
  await clickText('Fill in an example');
  await clickText('Generate AI profile');
  await wait(1600);
  await shot('21-merchant-aiprofile');

  await go('/merchant/products');
  await shot('22-merchant-products');

  /* ----------------------------------------------------------- 8. mobile */
  await page.setViewport({ width: 400, height: 780 });
  await go('/agent');
  await wait(700);
  await shot('23-mobile-agent');
  await go('/');
  await shot('24-mobile-home');

  await browser.close();
  console.log('\nDone.');
}

main().catch((e) => {
  console.error('capture failed:', e.message);
  process.exit(1);
});
