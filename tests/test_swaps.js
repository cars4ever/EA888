'use strict';
// Engine swaps (v1.23). The cycle model was already written for any cylinder count - engine.js takes it from
// the geometry - but sim.js hard-coded four in three places: engineGeometry, the cycle-model call and the
// compression test. Cylinder count, bore, stroke and rod now come from the block, so a swap is a block.
const assert = require('assert');
const C = require('../src/assets/sim.js');

const build = preset => { const s = C.applyPreset(C.blankState(), preset); s.tune.ecu = null; return s; };
const run = s => C.simulateEngine(s, { noise: false });

// Real engines, real dimensions. These are the figures the swap is supposed to be, so they are asserted:
// a swap that quietly runs on EA888 geometry would produce the wrong displacement here.
const EXPECT = {
  vr6_swap:    { cyl: 6, cc: 3189, arch: 'vr6' },
  daza_swap:   { cyl: 5, cc: 2480, arch: 'i5' },
  rb25_swap:   { cyl: 6, cc: 2499, arch: 'i6' },
  rb26_swap:   { cyl: 6, cc: 2569, arch: 'i6' },
  jz_swap:     { cyl: 6, cc: 2997, arch: 'i6' },
  rotary_swap: { cyl: 2, cc: 1308, arch: 'rotary' },
  smx4000:     { cyl: 8, cc: 8861, arch: 'v8' },
};

for (const [preset, want] of Object.entries(EXPECT)) {
  const s = build(preset);
  const g = C.engineGeometry(s);
  assert.strictEqual(g.cylinders, want.cyl, `${preset}: ${g.cylinders} cylinders, expected ${want.cyl}`);
  assert.strictEqual(g.architecture, want.arch, `${preset}: architecture ${g.architecture}`);
  assert(Math.abs(g.realDisplacementCc - want.cc) < 12,
    `${preset}: ${Math.round(g.realDisplacementCc)} cc, expected about ${want.cc}`);
  // Every swap must complete a pull on its own preset and make power in the right order of magnitude.
  const r = run(s);
  assert.strictEqual(r.status, 'completed', `${preset}: the preset must survive its own pull (${r.abortReason || ''})`);
  assert(r.peakHp > 300, `${preset}: only ${Math.round(r.peakHp)} pk`);
  assert(r.reliabilityScore >= 30, `${preset}: ${r.reliabilityScore} reliability is not a sellable build`);
  // The compression test must measure every cylinder there is, not four.
  const bench = C.runBenchTest(s, 'compression');
  assert.strictEqual(bench.values.length, want.cyl,
    `${preset}: compression test reported ${bench.values.length} cylinders`);
}

// Displacement drives torque: on the same boost the bigger engine must make more of it.
const nmOf = p => run(build(p)).peakTorqueNm;
assert(nmOf('jz_swap') > nmOf('rb25_swap'),
  'three litres must out-torque two and a half on comparable boost');
assert(nmOf('smx4000') > nmOf('jz_swap') * 2.5, 'nearly nine litres is another category again');

// A swapped block keeps its own stroke: a VW stroker crank means nothing inside an RB26.
const rb26 = build('rb26_swap');
const strokeWith = crank => { const s = build('rb26_swap'); s.selections.crank = crank; return C.engineGeometry(s).strokeMm; };
assert.strictEqual(strokeWith('stroker_100'), C.engineGeometry(rb26).strokeMm,
  'an EA888 stroker crank must not restroke a swapped engine');

// The Wankel: 1308 cc of real chambers that breathe like 2616 cc of four-stroke, because both chambers pass
// every revolution of the eccentric shaft where a four-stroke swallows half its displacement per revolution.
const rot = C.engineGeometry(build('rotary_swap'));
assert(Math.abs(rot.displacementCc - 2 * rot.realDisplacementCc) < 12,
  `the rotary's breathing equivalent must be twice its real capacity (${Math.round(rot.displacementCc)} vs ${rot.realDisplacementCc})`);
assert(rot.mpsStrokeMm < rot.strokeMm,
  'a rotor does not reciprocate: its equivalent piston speed must not be read off the equivalent stroke');
const rotRun = run(build('rotary_swap'));
assert(rotRun.maxMeanPistonSpeed < 26,
  `and so it must not be taxed as if it did (${rotRun.maxMeanPistonSpeed.toFixed(1)} m/s)`);

// The Steve Morris package is what it says on the tin.
const smx = run(build('smx4000'));
assert(smx.peakHp >= 3900, `the SMX package must make its rated power (${Math.round(smx.peakHp)} pk)`);
assert(smx.reliabilityScore >= 40, `and hold together doing it (${smx.reliabilityScore})`);
// It is a package: at its rated power the transmission and the turbos are already load-bearing.
for (const [cat, weaker] of [['transmission', 'promod_5speed'], ['turbo', 'pt10603']]) {
  const s = build('smx4000'); s.selections[cat] = weaker;
  const r = run(s);
  assert(r.status !== 'completed' || r.peakHp < smx.peakHp - 200,
    `${cat}: the package part must be load-bearing (${r.status}, ${Math.round(r.peakHp)} pk)`);
}
// The fuel system is not the limit at the rated tune - it is what lets the package be turned up. The promod
// methanol system runs out of pump doing that, which is why the package carries its own.
const turnedUp = sys => {
  const s = build('smx4000');
  s.selections.fuelSystem = sys;
  s.tune.boostHighBar = 4.2;
  return run(s);
};
const onSmxFuel = turnedUp('smx_methanol_fuel'), onPromodFuel = turnedUp('promod_methanol_fuel');
assert(onPromodFuel.maxFuelDuty > 99 && onSmxFuel.maxFuelDuty < 90,
  `turned up, the promod pump must run out where the package's does not (${Math.round(onPromodFuel.maxFuelDuty)} % vs ${Math.round(onSmxFuel.maxFuelDuty)} %)`);
// It ends the pull rather than leaning the engine out, so what it costs is the run, not the peak: the number
// still shown for an aborted pull is the highest observed before the abort, per the strict dyno model.
assert.strictEqual(onPromodFuel.status, 'aborted', 'running the pump past its capacity must end the pull');
assert.strictEqual(onSmxFuel.status, 'completed', "the package's own system must carry the same tune");

// The ALS bang rate follows the cylinder count instead of assuming four.
const flames = preset => {
  const s = build(preset);
  s.tune.als = { ...(s.tune.als || {}), mode: 'drag' };
  return C.simulateRaceRun(s, { reactionTime: 0, antiLag: true });
};
assert(flames('smx4000').quarter > 0 && flames('rotary_swap').quarter > 0,
  'an eight-cylinder and a two-rotor must both get through a race with anti-lag');


// ---- fitting a big engine to a small build must say so, not just stop -------------------------------
// Reported from play: a Steve Morris block with the most expensive gearbox ended the pull at 2800 rpm on
// "torque peak exceeded the limit of engine or transmission", and the tuner had nothing to offer. The limit
// was a bare minimum over seven categories, so it could not name which one, and the advice offered the next
// block and crank regardless of which category was actually low.
{
  const mismatched = () => {
    const s = build('smx4000');
    Object.assign(s.selections, { crank: 'randy_balanced_crank', transmission: 'randy_o2q', valvetrain: 'randy_ferrea' });
    return s;
  };
  const s = mismatched();
  const r = run(s);
  assert.strictEqual(r.abortCode, 'torque', 'this build must still end on torque');
  // The reason names the part, its rating and what was actually made.
  assert(/versnellingsbak|krukas|kleppentrein/.test(r.abortReason), `the abort must name the part: "${r.abortReason}"`);
  assert(/\d+ Nm/.test(r.abortReason), `and its rating: "${r.abortReason}"`);

  // The chain itself is readable, weakest first.
  const chain = C.loadLimitChain(s, 'torqueLimit');
  assert.strictEqual(chain.weakest.category, 'transmission', 'the O2Q is the weakest link here');
  assert(chain.parts.every((p, i, a) => i === 0 || p.value >= a[i - 1].value), 'the chain must be ordered weakest first');

  // And the tuner has something to say: the part that is the limit, and one entry that matches the whole
  // build to the engine rather than walking the player from wall to wall.
  s.lastDyno = r;
  const advice = C.adviceCandidates(s, 'abort:torque');
  assert(advice.some(a => a && /versnellingsbak/i.test(a.label)),
    `the advice must reach for the part that is the limit: ${advice.map(a => a && a.label).join(' | ')}`);
  const set = advice.find(a => a && /op de motor afstemmen/i.test(a.label));
  assert(set, 'a swapped engine must offer one entry that lifts every part below it');
  for (const cat of ['transmission', 'crank', 'valvetrain']) {
    assert(set.patch.selections[cat], `that entry must cover the ${cat}`);
  }
  // Applying it must let the pull finish.
  const fixed = mismatched();
  Object.assign(fixed.selections, set.patch.selections);
  assert.strictEqual(run(fixed).status, 'completed', 'and taking the advice must let the pull finish');
}

module.exports = {
  swaps: Object.keys(EXPECT).length,
  power: Object.fromEntries(Object.keys(EXPECT).map(k => [k, Math.round(run(build(k)).peakHp)]))
};
