'use strict';
// The best build this catalogue allows for every engine, and the in-game tuner measured against it.
//
// The fixture is produced by `node tools/max_builds.js --json tests/fixtures/max_builds.json`: an offline
// coordinate search over every part category, every turbo pairing and eleven tune axes, judged by exactly the
// margins the in-game race map is judged by. Two things are asserted of it.
//
//   1. The recorded build still makes what it recorded. If the model changes underneath, this says so rather
//      than letting the reference quietly drift.
//   2. Given the same parts and a plain starting map, the in-game map optimiser gets within 98 % of it. That
//      is the real test: the offline search is thorough and slow, the in-game one has a budget of 70 pulls,
//      and if the difference is more than 2 % the tuner is not good enough to be the thing players rely on.
const assert = require('assert');
const C = require('../src/assets/sim.js');
const fixture = require('./fixtures/max_builds.json');

const TOLERANCE = 0.98;

function stateFrom(ref) {
  const s = C.blankState();
  Object.assign(s.selections, ref.selections);
  Object.assign(s.tune, ref.tune, { ecu: null });
  s.service = { ...s.service, oilId: '10w60_race', liters: 5.0, filterId: 'motorsport', oilAgeKm: 0, oilRuns: 0 };
  s.wear = { engine: 0, turbo: 0, clutch: 0, tyres: 0 };
  s.damage = { engine: 0, turbo: 0 };
  const a = C.assemblyHealth(s).targets, r = v => Math.round(v * 1000) / 1000;
  Object.assign(s.assembly, {
    topRingGapMm: r(a.topRingGapMm), secondRingGapMm: r(a.secondRingGapMm),
    rodClearanceMm: r(a.rodClearanceMm), mainClearanceMm: r(a.mainClearanceMm),
    sparkGapMm: r(a.sparkGapMm), balanceQualityPct: 100, deckSealQualityPct: 100,
    fastenerProcedurePct: 100, oilPrimed: true
  });
  return s;
}

// What a player has the moment they finish bolting the parts on: sensible, nowhere near optimal.
function plainMap(ref) {
  const s = stateFrom(ref);
  const range = key => {
    const p = C.MAP_PARAMS ? C.MAP_PARAMS.find(x => x.key === key) : null;
    return p ? C.mapParamRange(s, p) : null;
  };
  const boost = range('boostHighBar');
  const rev = range('revLimitRpm');
  const rail = range('railTargetBar');
  if (boost) {
    s.tune.boostHighBar = boost.lo + (boost.hi - boost.lo) * 0.5;
    s.tune.boostMidBar = boost.lo + (boost.hi - boost.lo) * 0.35;
    s.tune.boostLowBar = boost.lo + (boost.hi - boost.lo) * 0.15;
  }
  if (rev) s.tune.revLimitRpm = Math.round((rev.lo + (rev.hi - rev.lo) * 0.75) / 100) * 100;
  if (rail) s.tune.railTargetBar = Math.round(rail.lo + (rail.hi - rail.lo) * 0.5);
  s.tune.lambda = 0.85;
  s.tune.ignitionTrimDeg = 0;
  return s;
}

function optimise(state, goal) {
  const opt = C.createMapOptimizer(state, goal);
  let done = false, n = 0;
  while (!done && n < 400) { done = opt.step(); n++; }
  return opt.summary();
}

const report = {};
const shortfalls = [];
for (const [id, ref] of Object.entries(fixture)) {
  // 1. the reference still reproduces
  const r = C.simulateEngine(stateFrom(ref), { noise: false });
  assert.strictEqual(r.status, 'completed', `${id}: the reference build must complete its pull (${r.abortReason || ''})`);
  assert(Math.abs(r.peakHp - ref.hp) / ref.hp < 0.02,
    `${id}: the reference has drifted - fixture says ${ref.hp} pk, the model now makes ${Math.round(r.peakHp)}`);

  // 2. the in-game tuner, from a plain map, on the same parts
  const start = plainMap(ref);
  const sum = optimise(start, 'race');
  const reached = sum.after.hp / ref.hp;
  report[id] = {
    label: ref.label,
    reference: ref.hp,
    plainStart: Math.round(sum.before.hp),
    tuner: Math.round(sum.after.hp),
    pct: Math.round(reached * 1000) / 10,
    reliability: sum.after.reliability,
    ok: sum.ok
  };
  if (reached < TOLERANCE || !sum.ok) {
    shortfalls.push(`${id} (${ref.label}): tuner ${Math.round(sum.after.hp)} pk of ${ref.hp} = ${(reached * 100).toFixed(1)} %` +
      (sum.ok ? '' : `, map not sellable: ${JSON.stringify(sum.blockedBy)}`) +
      (sum.hardwareLimits && sum.hardwareLimits.length ? `, hardware: ${JSON.stringify(sum.hardwareLimits)}` : ''));
  }
}

assert.deepStrictEqual(shortfalls, [],
  `the in-game tuner must reach ${Math.round(TOLERANCE * 100)} % of the best build on the same parts:\n  ${shortfalls.join('\n  ')}`);

module.exports = { engines: Object.keys(fixture).length, tolerance: TOLERANCE, builds: report };
