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

module.exports = { ok: true };
console.log('PASS phase 9 tests');
