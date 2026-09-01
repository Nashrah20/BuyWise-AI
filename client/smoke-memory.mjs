/**
 * smoke-memory.mjs - does the agent still remember after you leave the page?
 *
 * Reproduces the reported bug: state a budget, navigate away, come back, then
 * ask about a product. The budget must still be there.
 */
import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:5173';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const problems = [];

async function panelText(page) {
  return page.evaluate(() => document.querySelector('aside')?.innerText || '');
}

async function ask(page, text) {
  await page.waitForSelector('#agent-input');
  await page.type('#agent-input', text);
  await page.keyboard.press('Enter');
  await wait(2600);
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    args: ['--no-sandbox'],
    defaultViewport: { width: 1360, height: 1000 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

  // Start clean.
  await page.goto(`${BASE}/agent`, { waitUntil: 'networkidle2' });
  await page.evaluate(() => localStorage.removeItem('buywise_conversation'));
  await page.reload({ waitUntil: 'networkidle2' });

  console.log('\n1. State a budget');
  await ask(page, 'I need headphones under 3000 with noise cancellation');
  let panel = await panelText(page);
  console.log(`   panel shows budget: ${panel.includes('3,000')}`);
  if (!panel.includes('3,000')) problems.push('budget missing right after stating it');

  console.log('\n2. Navigate away to Browse, then back to the agent');
  await page.goto(`${BASE}/shop`, { waitUntil: 'networkidle2' });
  await wait(700);
  await page.goto(`${BASE}/agent`, { waitUntil: 'networkidle2' });
  await wait(1800);

  panel = await panelText(page);
  const transcript = await page.evaluate(() => document.body.innerText);
  console.log(`   budget still in panel: ${panel.includes('3,000')}`);
  console.log(`   transcript restored:   ${transcript.includes('noise cancellation')}`);
  console.log(`   resumed notice shown:  ${transcript.includes('Picked up where you left off')}`);
  if (!panel.includes('3,000')) problems.push('BUDGET LOST after navigating away and back');
  if (!transcript.includes('Picked up where you left off')) problems.push('resume notice missing');

  console.log('\n3. Hard reload the page');
  await page.reload({ waitUntil: 'networkidle2' });
  await wait(1800);
  panel = await panelText(page);
  console.log(`   budget survives reload: ${panel.includes('3,000')}`);
  if (!panel.includes('3,000')) problems.push('BUDGET LOST after a reload');

  console.log('\n4. Ask about a product (the reported case)');
  await ask(page, 'Tell me about the SoundMax Pro ANC and whether it is a good choice');
  panel = await panelText(page);
  const stillToFind = /Still to find out[\s\S]{0,120}/.exec(panel)?.[0].replace(/\n/g, ' ') || '(none)';
  console.log(`   budget in panel: ${panel.includes('3,000')}`);
  console.log(`   ${stillToFind.trim()}`);
  if (!panel.includes('3,000')) problems.push('BUDGET LOST after asking about a named product');
  if (/Still to find out[\s\S]{0,80}budget/i.test(panel)) {
    problems.push('panel still asks for a budget that was already given');
  }
  await page.screenshot({ path: './shots/memory-after.png', fullPage: true });

  console.log('\n5. "Start a new search" clears it');
  const btn = await page.evaluateHandle(() =>
    [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Start a new search'))
  );
  await btn.click();
  await wait(600);
  const stored = await page.evaluate(() => localStorage.getItem('buywise_conversation'));
  console.log(`   stored id cleared: ${stored === null}`);
  if (stored !== null) problems.push('"Start a new search" did not clear the stored conversation');

  await browser.close();

  console.log(`\n${'='.repeat(60)}`);
  if (problems.length) {
    problems.forEach((p) => console.log(`  - ${p}`));
    process.exit(1);
  }
  console.log('Conversation memory survives navigation and reload.');
}

main().catch((e) => {
  console.error('failed:', e.message);
  process.exit(1);
});
