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

module.exports = { ok: true };
console.log('PASS phase 9 tests');
