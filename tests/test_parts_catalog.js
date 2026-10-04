'use strict';
// The parts catalogue from the research's prices.csv: real prices with their source and condition, no budget-
// board totals or whole cars among the parts, duplicates merged only where a line repeats another, and a link to
// a game part only where it is the same part.
const assert = require('assert');
const C = require('../src/assets/sim.js');
const R = C.ROSTER, cat = R.parts;

assert(cat && Array.isArray(cat.parts) && cat.parts.length > 50, 'parts catalogue missing');
const TOTALS = ['power_adder', 'ecu', 'transmission', 'purchase'];
const CONDITIONS = [null, 'used', 'new', 'scratch_and_dent', 'sponsored', 'remanufactured'];
const seen = new Set();
for (const p of cat.parts) {
  assert(!TOTALS.includes(p.item), `${p.item}: a budget-board total is not a part`);
  assert(Number.isFinite(p.priceUsd) && p.priceUsd > 0, `${p.item}: no price`);
  assert(p.source && p.source.video, `${p.item}: no source video`);
  assert(CONDITIONS.includes(p.condition), `${p.item}: condition ${p.condition}`);
  assert(p.group, `${p.item}: no group`);
  assert(!!p.slot !== !!p.notFitting, `${p.item}: either linked to a game part or listed as not fitting, with why`);
  if (p.slot) {
    assert(C.CATEGORY_MAP[p.slot.category]?.items.some(i => i.id === p.slot.partId), `${p.item}: linked to a part the game does not have`);
    assert(p.slot.reason, `${p.item}: link without a reason`);
  }
  const key = `${p.carId}|${p.priceUsd}|${p.item.toLowerCase()}`;
  assert(!seen.has(key), `${p.item}: duplicate line`);
  seen.add(key);
}
assert(cat.notInCatalog.every(a => a.reason && a.source && a.source.video), 'every row left out says why and where from');
assert(cat.notInCatalog.some(a => /hele auto/.test(a.reason)), 'whole cars are kept apart');
// the one part that is the same as a game part: the Precision 7675 (sold new in the game)
const offers = C.rosterPartOffers('turbo', 'pt7675');
assert.strictEqual(offers.length, 1, 'the reman PT7675 is linked to the game\'s PT7675');
assert.strictEqual(offers[0].condition, 'remanufactured');
// euros next to dollars with the fixed game rate; the dollar price stays the source
assert(R.currency.usdToEur > 0 && R.currency.reason, 'game rate with a reason');
assert.strictEqual(C.usdToEur(100), 100 * R.currency.usdToEur);

console.log('PASS parts catalogue tests');
module.exports = { parts: cat.parts.length, notInCatalog: cat.notInCatalog.length, merged: cat.mergedDuplicates.length, linked: cat.parts.filter(p => p.slot).length };
