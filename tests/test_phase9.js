'use strict';
// 1.13: the rpm-limit chain, compound turbos from the turbo list, the full-throttle burnout.
const assert = require('assert');
const C = require('../src/assets/sim.js');
const build = (preset, mutate) => { const s = C.applyPreset(C.blankState(), preset); if (mutate) mutate(s); return C.normalizeState(s); };

// 1. Over-rev names the part that actually limits the revs, and a full pro-mod rotating/valve assembly
//    reaches 10 500 rpm without floating a valve.
{
  // the most expensive valvetrain and head on the stock-ish JE83 short block: the block limits, not the valves
  const r = C.simulateEngine(build('randy', s => {
    Object.assign(s.selections, { valvetrain: 'promod_valvetrain', head: 'promod_head', ecu: 'promod_ecu' });
    s.tune.revLimitRpm = 10500;
  }), { noise: false });
  assert.strictEqual(r.abortCode, 'overrev', `expected an over-rev, got ${r.abortCode}`);
  assert.notStrictEqual(r.abortLimitCategory, 'valvetrain', 'a pro-mod valvetrain must not be blamed');
  assert(!/Valve-float/.test(r.abortReason), `reason must not say valve float: ${r.abortReason}`);
  const chain = C.rpmLimitChain(build('randy', s => Object.assign(s.selections, { valvetrain: 'promod_valvetrain', head: 'promod_head' })));
  assert.strictEqual(r.abortLimitCategory, chain.weakest.category, 'the abort names the weakest link');
  assert(r.abortRpm > chain.weakest.rpm, 'it happens above that part\'s limit');
  // the advice upgrades the limiting part(s), not the valvetrain
  const adv = C.adviceCandidates(build('randy', s => { Object.assign(s.selections, { valvetrain: 'promod_valvetrain', head: 'promod_head', ecu: 'promod_ecu' }); s.tune.revLimitRpm = 10500; }), 'abort:overrev');
  assert(adv.some(a => a.patch.selections && (a.patch.selections.block || a.patch.selections.crank || a.patch.selections.oiling)), 'advice upgrades the bottom end');
  assert(!adv.some(a => a.patch.selections && a.patch.selections.valvetrain), 'advice does not sell another valvetrain');

  // full pro-mod: 10 500 rpm limiter, no over-rev
  const pm = C.simulateEngine(build('unlimited', s => { s.tune.revLimitRpm = 10500; }), { noise: false });
  assert.notStrictEqual(pm.abortCode, 'overrev', 'pro-mod parts are made for 10 500 rpm');
  assert.strictEqual(pm.targetRpm, 10500, 'the dyno sweeps up to the 10 500 rpm limiter');
  if (pm.status === 'completed') assert(pm.rpmReached >= 10400, `reached ${pm.rpmReached}`);

  // an ECU that cannot command the limiter caps the revs (cut), it does not break the engine
  const capped = build('unlimited', s => { s.selections.ecu = 'randy_syvecs'; s.tune.revLimitRpm = 10000; });
  assert.strictEqual(C.effectiveRevLimit(capped), 9200, 'Syvecs (Randy) commands up to 9200 rpm');
  const rc = C.simulateEngine(capped, { noise: false });
  assert.notStrictEqual(rc.abortCode, 'overrev', 'an ECU cap is a limiter, not a failure');
  assert(rc.warnings.some(w => /kan maximaal 9200 rpm/.test(w.text)), 'the cap is explained');
}

// 2. Burnout: holding the button is full throttle. Nothing backs the pedal off; the revs are set by the
//    tyre/clutch physics and a limiter (the normal one, or the optional burnout limiter). No anti-lag.
{
  const run = (preset, tyre, mutate) => {
    const st = build(preset, s => { s.vehicle.tyre = tyre; if (mutate) mutate(s); });
    const rt = C.createBurnoutRuntime(st, { startC: 28 });
    const trace = [];
    for (let i = 0; i < 100; i++) trace.push(rt.step(0.04, { throttle: true }));
    return { rt, trace };
  };
  for (const [preset, tyre] of [['randy', 'drag_radial'], ['stock', 'street'], ['k04', 'semislick']]) {
    const { rt, trace } = run(preset, tyre);
    const after = trace.filter(p => p.t > 0.4);
    assert(after.every(p => p.pedal > 0.97), `${preset}: the pedal stays flat (min ${Math.min(...after.map(p => p.pedal)).toFixed(2)})`);
    const peak = Math.max(...trace.map(p => p.rpm));
    assert(peak > rt.targetRpm, `${preset}: full throttle revs past the clutch-dump rpm (${Math.round(peak)})`);
    assert(trace.some(p => p.limiter), `${preset}: it reaches the rev limiter`);
    assert(trace.every(p => p.rpm <= rt.cutRpm + 250), `${preset}: never beyond the limiter`);
    const spin = trace.filter(p => p.t > 1.5);
    assert(Math.min(...spin.map(p => p.rpm)) > 0.8 * rt.cutRpm, `${preset}: no bogging or re-rev dips once spinning (${Math.round(Math.min(...spin.map(p => p.rpm)))})`);
    assert(trace.every(p => !(p.alsActive)), 'no anti-lag in a burnout');
  }
  // the optional burnout limiter cuts at the set rpm, pedal still flat
  const { rt, trace } = run('randy', 'drag_radial', s => { s.vehicle.burnoutLimiter = true; s.vehicle.burnoutRpm = 5500; });
  assert.strictEqual(rt.mode, 'limiter');
  const held = trace.filter(p => p.t > 1.5);
  assert(held.every(p => p.pedal > 0.97 && Math.abs(p.rpm - 5500) < 350), `burnout limiter holds 5500 (${held.map(p => Math.round(p.rpm)).slice(0, 5)})`);
  // releasing the button lets the revs fall to idle
  for (let i = 0; i < 60; i++) rt.step(0.05, { throttle: false });
  assert(rt.point().rpm < 1300, 'off the throttle it idles');
}

// 3. Compound = two turbos from the turbo list in series. Physics invariants of the series solution.
{
  const T = require('../src/assets/turbo.js');
  // capture a real solver context from a dyno pull (the engine's breathing, exhaust and charge air)
  const seen = [];
  const orig = T.matchCompound;
  T.matchCompound = function (ctx, hpMap, target) { const r = orig.call(this, ctx, hpMap, target); seen.push({ ctx, hpMap, target, r }); return r; };
  const st = build('hx52', s => { s.selections.turbo = 'pt6870'; s.selections.turboHp = 'k04'; });
  const comp = C.simulateEngine(st, { noise: false });
  T.matchCompound = orig;
  const series = seen.filter(x => x.r.compoundStage === 'series' && x.r.limitedBy === 'target');
  assert(series.length > 3, 'the HP stage works at the target in the mid range');
  for (const { ctx, r } of series) {
    const K = 0.2857;
    // the pressure ratios multiply (less the interstage duct loss)
    assert(Math.abs(r.prLp * r.prHp - r.pressureRatio) / r.pressureRatio < 0.03, `PR ${r.pressureRatio.toFixed(3)} vs ${r.prLp.toFixed(3)} x ${r.prHp.toFixed(3)}`);
    // the HP stage breathes the warm LP outlet; its outlet is hotter still before the intercooler
    assert(r.interstageC > ctx.ambientK - 273.15 + 3 && r.compoundStage && r.compressorOutC >= r.interstageC - 1e-6, 'interstage temperature between ambient and the HP outlet');
    // the dense interstage air: the small HP wheel sees the LP corrected flow divided by the LP pressure
    // ratio (times sqrt of the temperature rise), i.e. far less than the LP wheel
    const Ta = ctx.ambientK, Ti = r.interstageC + 273.15, expect = r.correctedFlowLbMin * Math.sqrt(Ti / Ta) / r.prLp;
    assert(r.hpCorrectedFlowLbMin >= expect * 0.99 && r.hpCorrectedFlowLbMin < expect * 1.06 && r.hpCorrectedFlowLbMin < r.correctedFlowLbMin, `HP corrected flow ${r.hpCorrectedFlowLbMin} vs ${expect}`);
    // exhaust: manifold > interstage > turbine outlet (two expansions in series)
    assert(r.empBarAbs > r.interstageExhaustBarAbs && r.interstageExhaustBarAbs > r.turbineOutBarAbs, 'two turbine stages in series');
    // at the target the HP turbine bypass regulates (0..100 %)
    assert(r.hpBypassPct >= 0 && r.hpBypassPct <= 100);
    // no free energy: turbine power drives both compressors
    assert(r.turbineKw * 0.95 >= r.compressorKw * 0.98, `turbines ${r.turbineKw.toFixed(1)} kW vs compressors ${r.compressorKw.toFixed(1)} kW`);
    void K;
  }
  // the fitted airflow the solver uses matches the engine model
  const { ctx, target } = series[0];
  const fit = T.airflowFit(ctx, target.targetBoostBar);
  for (const B of [0.2, target.targetBoostBar * 0.6, target.targetBoostBar]) for (const tK of [300, 330, 360])
    assert(Math.abs(fit(B, tK) / ctx.airflowAt(B, tK) - 1) < 0.004, `airflow fit at ${B.toFixed(2)} bar, ${tK} K`);

  // compound vs each turbo alone: spools like the small one, keeps the top end of the big one
  const alone = id => C.simulateEngine(build('hx52', s => { s.selections.turbo = id; s.selections.turboHp = ''; }), { noise: false });
  const small = alone('k04'), big = alone('pt6870');
  const at = (r, rpm) => r.samples.find(p => p.rpm === rpm) || {};
  assert(at(comp, 4000).boostBar > at(big, 4000).boostBar + 0.4, 'far more boost at 4000 than the big turbo alone');
  assert(at(comp, 4000).boostBar > at(small, 4000).boostBar - 0.05, 'as much as the small turbo alone');
  assert(comp.peakHp > small.peakHp * 1.2, `more top end than the small turbo alone (${comp.peakHp} vs ${small.peakHp})`);
  assert(comp.peakHp >= big.peakHp * 0.98, `no less than the big turbo alone (${comp.peakHp} vs ${big.peakHp})`);

  // the HP stage must be the smaller turbo; otherwise it is refused (warning, no effect)
  const wrong = build('hx52', s => { s.selections.turbo = 'k04'; s.selections.turboHp = 'pt7675'; });
  assert.strictEqual(C.compoundHp(wrong).valid, false);
  const rw = C.simulateEngine(wrong, { noise: false });
  assert(rw.warnings.some(w => /HP-trap moet de kleinere turbo/.test(w.text)), 'the refusal is explained');
  assert.strictEqual(rw.peakHp, small.peakHp, 'an invalid compound changes nothing');

  // one canonical build: the HP turbo is part of the selections, price, mass and the dyno signature
  const one = build('hx52', s => { s.selections.turbo = 'pt6870'; s.selections.turboHp = ''; });
  assert.strictEqual(C.totalPartsPrice(st) - C.totalPartsPrice(one), C.CATEGORY_MAP.turbo.items.find(i => i.id === 'k04').price + C.COMPOUND_KIT.price);
  assert(C.buildMassKg(st) > C.buildMassKg(one));
  assert.notStrictEqual(C.engineSignature(st), C.engineSignature(one), 'fitting the HP turbo invalidates the dyno');
  // 1.12 saves with a compound kit category migrate to the HP turbo
  const old = C.normalizeState({ ...C.blankState(), selections: { ...C.blankState().selections, compound: 'compound_g25' } });
  assert.strictEqual(old.selections.turboHp, 'g25');
  assert.strictEqual(old.selections.compound, undefined);
}

// 4. Regression (1.13.0: a small HP turbine choked the exhaust, 11.7 bar manifold pressure and a 2912 C EGT
//    on the dyno): the controller opens the HP turbine bypass to keep EMP within 1.9 x MAP (absolute), the
//    bypass is sized for the full exhaust flow, and the handover to the LP turbo has no boost collapse.
{
  const baro = 1.01325;
  for (const [lp, hp] of [['g25', 'k03'], ['pt8685', 'k03'], ['pt10603', 'k03'], ['pt6870', 'k04'], ['pt7675', 'g25'], ['k04_hybrid', 'k03']]) {
    const r = C.simulateEngine(build('randy', s => { s.selections.turbo = lp; s.selections.turboHp = hp; }), { noise: false });
    for (const p of r.samples) {
      assert(p.empBar + baro <= 1.9 * (p.boostBar + baro) + 0.15 || p.compoundStage === 'lp', `${lp}+${hp} ${p.rpm}: EMP ${p.empBar} bar at ${p.boostBar} bar boost`);
      assert(p.egtC < 1100, `${lp}+${hp} ${p.rpm}: EGT ${p.egtC}`);
    }
    assert(Math.max(...r.samples.map(p => p.empBar)) < 5, `${lp}+${hp}: manifold pressure stays physical`);
  }
  // PT6870 + K04: once at the target it holds it to the limiter (no drop when the HP stage hands over)
  const r = C.simulateEngine(build('randy', s => { s.selections.turbo = 'pt6870'; s.selections.turboHp = 'k04'; }), { noise: false });
  const on = r.samples.filter(p => p.rpm >= 5000);
  assert(Math.min(...on.map(p => p.boostBar)) > 0.85 * Math.max(...on.map(p => p.boostBar)), `no boost collapse at the handover: ${on.map(p => p.boostBar.toFixed(2)).join(' ')}`);
  assert(on[on.length - 1].hpBypassPct > on[0].hpBypassPct, 'the HP bypass opens as the LP turbo takes over');
}

module.exports = { ok: true };
console.log('PASS phase 9 tests');
