'use strict';
// Compound boost as a pressure-ratio stack, and 2500 pk from two litres (v1.23).
//
// Three faults kept this from working at all:
//  1. matchCompound bypassed the HP stage whenever the LP turbo was not spool-limited, so a compound was a
//     spool aid and never a way to reach a pressure ratio one compressor cannot make. Adding any HP turbo to
//     the `unlimited` build changed its peak by under 1 %.
//  2. Surge was treated as a ceiling on boost and searched for with bisectMax, which assumes the predicate is
//     true low and false high. Surge is the opposite - a flow floor - so the search drove boost *down* into
//     surge: a PT10603 answered 0.80 bar where at full flow it sits 18 % right of its own surge line. One
//     such sample low down then poisoned the whole pull through the rotor-inertia chain.
//  3. The first stage took every pressure ratio its turbine could drive, with no wastegate control, so a
//     compressor sized for 2500 pk of airflow sat deep in surge at 5000 rpm.
const assert = require('assert');
const C = require('../src/assets/sim.js');
const Turbo = require('../src/assets/turbo.js');

const build = (preset, mutate) => {
  const s = C.applyPreset(C.blankState(), preset);
  if (mutate) mutate(s);
  s.tune.ecu = null;
  return s;
};
const run = s => C.simulateEngine(s, { noise: false });
const peak = r => (r.samples || []).reduce((a, p) => (p.hp > (a.hp || 0) ? p : a), {});
const at = (r, rpm) => (r.samples || []).reduce((a, p) => (Math.abs(p.rpm - rpm) < Math.abs(a.rpm - rpm) ? p : a));

// ---- 1. a second stage multiplies the pressure ratio -------------------------------------------------
// The LP turbo here is held back by its own shaft speed, not by spool, which is exactly the case the old
// early return threw away.
const lpOnly = run(build('unlimited', s => { s.tune.boostMidBar = 8; s.tune.boostHighBar = 8; }));
const stacked = run(build('unlimited', s => {
  s.selections.turboHp = 'pt6870';
  s.selections.boostControl = 'triple_60_compound';
  s.selections.ignition = 'magneto_cdi';
  s.tune.boostMidBar = 8; s.tune.boostHighBar = 8;
}));
assert(peak(stacked).boostBar > peak(lpOnly).boostBar * 1.3,
  `two stages must reach a pressure the single cannot (${peak(stacked).boostBar.toFixed(2)} vs ${peak(lpOnly).boostBar.toFixed(2)} bar)`);
// The split is uneven when the LP turbo is a big single that could nearly do it alone, but the second stage
// has to be carrying a real part of the ratio rather than windmilling.
assert(peak(stacked).prHp > 1.2, `the HP stage must carry real ratio (PR_hp ${peak(stacked).prHp})`);
assert(peak(stacked).prLp * peak(stacked).prHp > peak(lpOnly).prLp * 1.25,
  `the stack must beat what one stage reached (${(peak(stacked).prLp * peak(stacked).prHp).toFixed(2)} vs ${peak(lpOnly).prLp.toFixed(2)})`);

// ---- 2. an oversized first stage is not answered with a collapse -------------------------------------
// Asking for more boost must never give less power, and the surge flag must not be used to cut boost into
// the region where the compressor genuinely surges.
const ladder = [7, 8, 9, 10].map(b => run(build('compound2500', s => {
  s.tune.boostMidBar = b; s.tune.boostHighBar = b;
})).peakHp);
for (let i = 1; i < ladder.length; i++) {
  assert(ladder[i] > ladder[i - 1] * 0.9,
    `raising the boost target must not collapse the pull (${ladder.map(Math.round).join(' -> ')} pk)`);
}
// The biggest turbo in the catalogue, on this engine, must still make real power in a compound.
const biggest = run(build('compound2500'));
assert(peak(biggest).surgeMarginPct > 0,
  `the first stage must run right of its surge line at peak power (${peak(biggest).surgeMarginPct} %)`);

// The surge line inverts: the highest ratio a given flow can hold.
const map = Turbo.getMap('pt10603');
assert(typeof map.surgePr === 'function', 'a compressor map must be able to read its surge line by flow');
assert(map.surgePr(map.surgeFlow(3)) > 2.8 && map.surgePr(map.surgeFlow(3)) < 3.2,
  'surgePr must invert surgeFlow');
assert(map.surgePr(0) <= 1.05, 'at no flow a compressor can hold no pressure ratio');

// ---- 3. the owner's goal: 2500 pk from two litres ----------------------------------------------------
const goal = run(build('compound2500'));
assert.strictEqual(goal.status, 'completed', `the 2500 pk build must survive its own pull (${goal.abortReason || ''})`);
assert(goal.peakHp >= 2500, `the compound preset must reach 2500 pk (${Math.round(goal.peakHp)})`);
assert(goal.reliabilityScore >= 30,
  `and it must not be a guaranteed grenade (${goal.reliabilityScore} reliability)`);
// On the full 2.0 litre, not only on the destroked crank.
const twoLitre = run(build('compound2500', s => { s.selections.crank = 'promod_crank'; }));
assert(C.engineGeometry(twoLitre).displacementCc > 1980,
  'this case must actually be the two-litre');
assert(twoLitre.peakHp >= 2500, `2500 pk must be reachable on the full 2.0 L too (${Math.round(twoLitre.peakHp)})`);

// It takes the whole package: the parts that were added for it are each load-bearing.
for (const [cat, weaker] of [['boostControl', 'dual_60_co2'], ['ignition', 'dual_cdi'], ['head', 'promod_head']]) {
  const without = run(build('compound2500', s => { s.selections[cat] = weaker; }));
  assert(without.peakHp < goal.peakHp - 40,
    `${cat}: the compound part must be worth having (${Math.round(without.peakHp)} vs ${Math.round(goal.peakHp)} pk)`);
}

// ---- 4. a compound still buys the bottom end ---------------------------------------------------------
const single = run(build('randy'));
const compound = run(build('randy', s => { s.selections.turboHp = 'k03'; }));
assert(at(compound, 2500).torqueNm > at(single, 2500).torqueNm * 1.3,
  'the low end is still what a compound is for on a street build');

module.exports = {
  stackedBoostBar: Number(peak(stacked).boostBar.toFixed(2)),
  goal: { hp: Math.round(goal.peakHp), reliability: goal.reliabilityScore },
  twoLitreHp: Math.round(twoLitre.peakHp),
  boostLadder: ladder.map(Math.round)
};
