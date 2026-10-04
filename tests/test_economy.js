'use strict';
// Buying parts (career mode): what you mount and do not own is bought at its price, what you own you swap for
// free, OEM parts are always yours, a save from before keeps everything its build and slots use, and 'Vrij
// bouwen' costs nothing. A used offer from the research catalogue buys the same part at its real price.
const assert = require('assert');
const C = require('../src/assets/sim.js');

const fresh = C.normalizeState(C.blankState());
// the build you start with is yours; OEM parts cost nothing
for (const cat of C.CATEGORIES) assert(C.ownsPart(fresh, C.ownKey(cat.id, fresh.selections[cat.id])), `${cat.id}: the fitted part is not owned`);
assert(C.ownsPart(fresh, C.ownKey('turbo', 'k03')), 'OEM parts are always owned');
assert.deepStrictEqual(C.buildCost(fresh, fresh.selections).items, [], 'the current build costs nothing');

// a preset costs its missing parts at their new price; the compound kit counts once
const hx = C.buildCost(fresh, C.PRESETS.hx52.selections);
const expected = hx.items.reduce((a, it) => a + it.priceEur, 0);
assert(hx.total > 0 && hx.total === expected, 'preset cost is the sum of its missing parts');
assert(hx.items.some(i => i.key === 'turbo:hx52'), 'the HX52 is among them');
const comp = C.buildCost(fresh, { ...fresh.selections, turbo: 'pt8085', turboHp: 'pt6466' });
assert(comp.items.some(i => i.key === C.COMPOUND_KIT_KEY), 'a compound HP stage needs the kit');

// buying: refused without the money (nothing changes), paid and owned with it, free the second time
const poor = { ...fresh, bank: 100 };
const no = C.purchaseBuild(poor, C.PRESETS.hx52.selections);
assert(!no.ok && no.shortEur === hx.total - 100, 'refused with the shortfall');
const yes = C.purchaseBuild(fresh, C.PRESETS.hx52.selections);
assert(yes.ok && yes.bank === fresh.bank - hx.total, 'paid from the bank');
const after = { ...fresh, bank: yes.bank, owned: yes.owned };
assert.strictEqual(C.buildCost(after, C.PRESETS.hx52.selections).total, 0, 'owned parts cost nothing again');
assert.strictEqual(C.buildCost(after, fresh.selections).total, 0, 'and swapping back is free');

// sandbox
const free = { ...fresh, settings: { ...fresh.settings, freeBuild: true } };
assert.strictEqual(C.buildCost(free, C.PRESETS.compound2500.selections).total, 0, "'Vrij bouwen' costs nothing");

// a used offer: the real price in dollars at the game rate, the condition recorded
const offer = C.rosterPartOffers('turbo', 'pt7675')[0];
const used = C.purchaseUsedOffer(fresh, 'turbo', 'pt7675', offer.id);
assert(used.ok && used.paidEur === Math.round(C.usdToEur(offer.priceUsd)), 'used price from the catalogue');
assert(used.paidEur < C.CATEGORY_MAP.turbo.items.find(i => i.id === 'pt7675').price, 'cheaper than new');
assert.strictEqual(used.owned['turbo:pt7675'].condition, 'remanufactured');
assert(!C.purchaseUsedOffer({ ...fresh, owned: used.owned }, 'turbo', 'pt7675', offer.id).ok, 'not twice');

// saves from before parts were bought keep their build and slots; saves with ownership keep it
const old = C.normalizeState({ selections: { ...C.PRESETS.hx52.selections }, buildSlots: [{ selections: { turbo: 'pt9803' } }, null, null] });
assert(C.ownsPart(old, 'turbo:hx52') && C.ownsPart(old, 'turbo:pt9803'), 'an old save inherits its build and slots');
const kept = C.normalizeState({ owned: { 'turbo:g30': { how: 'new' } } });
assert(C.ownsPart(kept, 'turbo:g30') && !C.ownsPart(kept, 'turbo:hx52'), 'ownership is kept as saved');

console.log('PASS economy tests');
module.exports = { hx52PresetCostEur: hx.total, usedPt7675Eur: used.paidEur };
