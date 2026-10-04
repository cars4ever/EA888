'use strict';
// Four part categories carry their physics in a separate data file, looked up by the part's own id with an
// OEM fallback. A part added to the catalogue without its data entry therefore runs silently on OEM numbers
// instead of failing: a 5-inch open exhaust breathed through the OEM 63.5 mm pipe (2575 pk -> 968), and a
// billet compound head ran the OEM port (2690 -> 2150). Both looked like physics, both were missing data.
const assert = require('assert');
const C = require('../src/assets/sim.js');
const Engine = require('../src/assets/engine.js');
const Turbo = require('../src/assets/turbo.js');

const LINKED = [
  ['head', () => Engine.DATA.heads, 'data/engine/heads.json'],
  ['air', () => Turbo.DATA.chargeAir, 'data/turbo/charge-system.json'],
  ['exhaust', () => Turbo.DATA.exhaust, 'data/turbo/charge-system.json'],
  ['boostControl', () => Turbo.DATA.wastegate, 'data/turbo/charge-system.json'],
  // The driveline table is the same trap and the worst one yet: a gearbox without an entry fell back to the
  // OEM clutch at 430 Nm, so a 2500 pk compound build slipped its clutch to 1228 C for the whole quarter -
  // an 18-second run at 110 km/h that read as 0.7 % wheelspin, because the tyres were not the thing slipping.
  ['transmission', () => C.DRIVELINE, 'the DRIVELINE table in sim.js'],
];

const missing = [];
for (const [cat, table, file] of LINKED) {
  const data = table();
  for (const item of C.CATEGORY_MAP[cat].items) {
    if (!data[item.id]) missing.push(`${cat}/${item.id} has no entry in ${file}`);
  }
}
assert.deepStrictEqual(missing, [], `parts falling back to OEM physics:\n  ${missing.join('\n  ')}`);

// Every turbo in the catalogue must have a compiled map, for the same reason.
const noMap = C.CATEGORY_MAP.turbo.items.filter(i => !Turbo.getMap(i.id)).map(i => i.id);
assert.deepStrictEqual(noMap, [], `turbos without a compressor map: ${noMap.join(', ')}`);

module.exports = { linkedCategories: LINKED.length, parts: LINKED.reduce((n, [c]) => n + C.CATEGORY_MAP[c].items.length, 0) };
