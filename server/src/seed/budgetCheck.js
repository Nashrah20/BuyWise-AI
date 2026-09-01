/**
 * budgetCheck.js  -  node src/seed/budgetCheck.js
 * -----------------------------------------------------------------------------
 * Budget extraction is where a small regex mistake does the most damage: an
 * invented price ceiling silently wrecks every score in the shortlist.
 *
 * The negative cases matter as much as the positive ones - product names are
 * full of words and numbers that LOOK like budgets ("Endura Max 6000").
 */
import { extractWithRules } from '../services/intentService.js';

const blank = () => ({
  category: null, minPrice: null, maxPrice: null,
  brand: null, useCase: null, requirements: {}, priorities: {},
});

const CASES = [
  // --- a budget really was given ---------------------------------------
  ['headphones under 3000', 3000, null],
  ['a phone below 25000', 25000, null],
  ['laptop within 60000', 60000, null],
  ['my budget is 3000', 3000, null],
  ['budget of 2500', 2500, null],
  ['max budget 5000', 5000, null],
  ['maximum of 4000', 4000, null],
  ['max ₹4000', 4000, null],
  ['at most 2500', 2500, null],
  ['not more than 1500', 1500, null],
  ['around 2000', 2000, null],
  ['₹2,000', 2000, null],
  ['2000 rupees', 2000, null],
  ['under 2k', 2000, null],
  ['what if I increase my budget to 4000?', 4000, null],
  ['above 1000', null, 1000],
  ['between 2000 and 5000', 5000, 2000],
  ['Nova Lite 5G under 20000', 20000, null],
  // the number can come first - people really type these
  ['20000 budget', 20000, null],
  ['20k budget', 20000, null],
  ['5000 only', 5000, null],
  ['6000 max', 6000, null],

  // --- product names that must NOT become budgets ----------------------
  ['Tell me about the Endura Max 6000 and whether it is a good choice', null, null],
  ['Tell me about the SoundMax Pro ANC', null, null],
  ['is the Zenith Ultra 12 any good', null, null],
  ['Vivo y16 Pro', null, null],
  ['show me the BoomBox Go', null, null],
  ['MonsoonShield 35L', null, null],
  ['RapidView 27 165Hz', null, null],
  ['I want the ProForge Creator 16', null, null],
];

let failed = 0;
for (const [message, expectedMax, expectedMin] of CASES) {
  const { requirements } = extractWithRules(message, blank());
  const max = requirements.maxPrice;
  const min = requirements.minPrice;
  const ok = max === expectedMax && min === expectedMin;
  if (!ok) failed += 1;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'}  "${message}"\n        max=${max} (want ${expectedMax})  min=${min} (want ${expectedMin})`
  );
}

console.log(
  failed ? `\n${failed} of ${CASES.length} FAILING` : `\nall ${CASES.length} budget cases passed`
);
process.exit(failed ? 1 : 0);
