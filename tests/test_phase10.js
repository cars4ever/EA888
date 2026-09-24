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

// 5. Honest tuner (1.14.0: a map lost power on a build the hardware could not carry; a turbo 'fix' that
//    halved the power was 'best choice'): a map is 'better' (more power inside the margins), 'safer' (the
//    current map was outside them) or 'blocked' (no map meets them: named margins, not sold); an advice
//    option that costs much power never ranks as the best choice.
{
  // inside its margins a map never loses power
  const st = build('randy');
  const o = C.createMapOptimizer(st, 'race'); while (!o.step()); const r = o.summary();
  if (r.before.ok) assert(r.after.hp >= r.before.hp - 0.5 && r.outcome === 'better', `race map on a sound build: ${r.before.hp} -> ${r.after.hp} (${r.outcome})`);
  // a build whose hardware cannot meet the street margins (tiny K03 HP stage choking a big LP turbo, 3+ bar)
  const bad = build('unlimited', s => { s.selections.turbo = 'pt8685'; s.selections.turboHp = 'k03'; s.selections.fuelSystem = 'oem_fuel'; });
  const ob = C.createMapOptimizer(bad, 'street'); while (!ob.step()); const rb = ob.summary();
  assert(rb.outcome === 'blocked' ? rb.blockedBy.length > 0 : rb.ok, 'blocked maps name what blocks them');
  for (const x of [r, rb]) assert(['better', 'safer', 'blocked'].includes(x.outcome));
  // ranking: a resolved option that loses > 4 % power ranks below one that keeps the power
  const e = (id, resolved, improved, hpAfter, cost = 0) => ({ id, resolved, improved, hpBefore: 1000, hpAfter, cost });
  const ranked = C.rankAdvice([e('part:turbo:huge', true, true, 520, 4000), e('boost:-0.1', false, true, 995), e('part:boostControl:x', true, true, 990, 600)], 'turbo');
  assert.deepStrictEqual(ranked.map(x => x.id), ['part:boostControl:x', 'boost:-0.1', 'part:turbo:huge']);
  assert.strictEqual(ranked[2].tier, 2); assert(ranked[2].lossPct > 40);
  // a safety issue accepts more power loss for the fix
  assert.strictEqual(C.rankAdvice([e('spark:-2', true, true, 920)], 'knock')[0].tier, 0);
}

// 6. Regression (1.14.0: FWD and AWD burnouts with a laggy turbo bogged to ~1000 rpm): the pedal stays
//    flat, the driver slips the clutch to keep the revs in the power band (>= 80 % of the dump rpm) until the
//    turbo builds boost; the slip energy goes into the clutch.
for (const dt of ['FWD', 'AWD', 'RWD']) for (const [lp, hp] of [['pt8685', ''], ['pt9103', 'pt6870'], ['pt7675', 'k04']]) {
  const st = build('unlimited', s => { s.selections.turbo = lp; s.selections.turboHp = hp; s.vehicle.drivetrain = dt; s.vehicle.tireCompound = 'drag_radial'; s.vehicle.preparedTrack = true; });
  const rt = C.createBurnoutRuntime(st, { startC: 28 });
  let min = 1e9, slipped = false, p;
  for (let i = 0; i < 100; i++) { p = rt.step(0.05, { throttle: true }); if (p.t > 1.0) min = Math.min(min, p.rpm); if (p.clutchSlipping) slipped = true; assert(p.pedal > 0.97 || p.t < 0.4, 'pedal flat'); }
  assert(min > 0.75 * rt.targetRpm, `${dt} ${lp}+${hp || '-'}: no bog (min ${Math.round(min)} rpm, dump ${rt.targetRpm})`);
  if (slipped) assert(p.clutchKj > 0, 'a slipping clutch takes the energy');
}

module.exports = { ok: true };
console.log('PASS phase 10 tests');
