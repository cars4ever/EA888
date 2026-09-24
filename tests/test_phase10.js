'use strict';
// 1.14: tuner help (several recommendations together, same heat soak as the measurement), optimised maps,
// turbo load with a compound HP stage.
const assert = require('assert');
const C = require('../src/assets/sim.js');
const build = (preset, mutate) => { const s = C.applyPreset(C.blankState(), preset); if (mutate) mutate(s); return C.normalizeState(s); };

// 1. Advice is predicted at the heat soak of the measured pull; a hot cell makes less power.
{
  const st = build('randy');
  const cold = C.adviceBaseline(st), hot = C.adviceBaseline(st, { soakK: 25 });
  assert.strictEqual(hot.soakK, 25);
  assert(hot.peakHp < cold.peakHp, `heat soak costs power (${hot.peakHp} vs ${cold.peakHp})`);
  const cand = C.adviceCandidates(st, 'knock')[0];
  const e = C.evaluateAdvice(st, 'knock', cand, hot);
  assert(Math.abs(e.hpBefore - hot.peakHp) < 1e-9, 'the evaluation compares against the soaked baseline');
}

// 2. Several recommendations merge into one change: later ones win on the same setting, others add up.
{
  const a = { id: 'spark:-1', cost: 0, label: 'A', patch: { tune: { ignitionTrimDeg: -1.5 } } };
  const b = { id: 'part:fuelSystem:x', cost: 900, label: 'B', patch: { selections: { fuelSystem: 'race_fuel' } } };
  const c = { id: 'spark:-2', cost: 0, label: 'C', patch: { tune: { ignitionTrimDeg: -2.5, lambda: 0.78 } } };
  const m = C.mergeAdvice([a, b, c]);
  assert.deepStrictEqual(m.patch, { tune: { ignitionTrimDeg: -2.5, lambda: 0.78 }, selections: { fuelSystem: 'race_fuel' } });
  assert.strictEqual(m.cost, 900);
  const st = build('randy');
  const applied = C.applyAdvicePatch(st, m.patch);
  assert(applied.tune.ignitionTrimDeg === -2.5 && applied.selections.fuelSystem === 'race_fuel', 'one apply carries all picks');
}

// 3. Optimised maps: the street map ends inside its margins; the race map finds more power than the
//    street map and stays inside its own (wider) margins; both only touch the map, never the hardware.
{
  const st = build('randy', s => { s.selections.turbo = 'pt6870'; s.selections.turboHp = 'k04'; });
  const run = goal => { const o = C.createMapOptimizer(st, goal); let n = 0; while (!o.step()) n++; return o.summary(); };
  const street = run('street'), race = run('race');
  assert(street.ok, 'the street map is inside its margins');
  assert(race.ok, 'the race map is inside its margins');
  assert(race.after.hp > street.after.hp, `race map ${race.after.hp} > street map ${street.after.hp} pk`);
  assert(street.after.knock <= C.MAP_TUNES.street.knockMax + 1e-9, 'street map knock margin');
  for (const r of [street, race]) {
    assert.deepStrictEqual(Object.keys(r.patch), ['tune'], 'a map changes the tune only');
    const applied = C.applyAdvicePatch(st, r.patch);
    const check = C.simulateEngine(applied, { noise: false });
    assert(Math.abs(check.peakHp - r.after.hp) < 0.5, `applying the map reproduces the tuner's result (${check.peakHp} vs ${r.after.hp})`);
    assert.deepStrictEqual(applied.selections, st.selections);
  }
  assert(C.MAP_TUNES.race.price > C.MAP_TUNES.street.price);
}

// 4. Turbo load with a compound: the HP wheel past its choke line (the bypass carries the flow) is lost
//    efficiency, not a 200 % turbo load; its shaft speed does count.
{
  const r = C.simulateEngine(build('randy', s => { s.selections.turbo = 'pt6870'; s.selections.turboHp = 'k04'; }), { noise: false });
  assert(r.maxTurboLoad <= 115, `turbo load ${r.maxTurboLoad}`);
  for (const p of r.samples) assert(p.turboLoadPct === undefined || p.turboLoadPct >= (p.hpShaftPct || 0) - 1e-6, 'HP shaft speed is part of the turbo load');
}

module.exports = { ok: true };
console.log('PASS phase 10 tests');
