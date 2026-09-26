'use strict';
// The tuner, the reliability bands and compound boost (v1.22). These express what the owner reported
// after an hour of play: the tuner only reached for a handful of settings and never said what it changed,
// 500 pk at 80 reliability was out of reach however it was tuned, revving a built engine to 8000 was taxed
// as if it were stock, and a compound setup was slower than the single turbo it was added to.
const assert = require('assert');
const C = require('../src/assets/sim.js');

function optimise(state, goal, cap = 400) {
  const opt = C.createMapOptimizer(state, goal);
  let done = false, n = 0;
  while (!done && n < cap) { done = opt.step(); n++; }
  return opt.summary();
}
const build = (preset, mutate) => {
  const s = C.applyPreset(C.blankState(), preset);
  if (mutate) mutate(s);
  s.tune.ecu = null;
  return s;
};
const run = s => C.simulateEngine(s, { noise: false });

// ---- the tuner reaches for the whole build, not a corner of it --------------------------------------
const goals = Object.keys(C.MAP_TUNES);
assert(goals.includes('street') && goals.includes('safe') && goals.includes('race'),
  'expected a safe/max-power goal alongside street and race');

const randy = build('randy');
const safe = optimise(randy, 'safe');
const touched = safe.touched || [];
for (const needed of ['raildruk', 'toerenbegrenzer', 'uitlaatklep op TDC', 'laaddruk midden', 'lambda']) {
  assert(touched.includes(needed), `the tuner must be allowed to set ${needed} (it lists: ${touched.join(', ')})`);
}
// It must say what it did, in words, with both values.
for (const c of safe.changes) {
  assert(c.label && /[a-z]/.test(c.label), `change ${c.key} has no readable name`);
  assert(c.fromText && c.toText, `change ${c.key} has no readable before/after`);
}

// Hardware bounds: no ethanol blend on a fixed grade, no rail pressure past the pump.
const fixedGrade = build('randy', s => { s.selections.fuel = 'ron98'; });
assert(!(optimise(fixedGrade, 'race').touched || []).includes('ethanolgehalte'),
  'ethanol is not tunable on a fixed fuel grade');
const railMax = C.CATEGORY_MAP.fuelSystem.items.find(i => i.id === randy.selections.fuelSystem).maxRailBar;
const railChange = safe.changes.find(c => c.key === 'railTargetBar');
if (railChange) assert(railChange.to <= railMax + 1e-6, `rail pressure ${railChange.to} past the pump's ${railMax}`);

// ---- the owner's goal: 500 pk at 80 reliability, on the owner's own build ---------------------------
assert(safe.ok, `the safe map must be sellable on this build (blocked by ${JSON.stringify(safe.blockedBy)})`);
assert(safe.after.hp >= 500, `safe goal reached only ${Math.round(safe.after.hp)} pk, expected >= 500`);
assert(safe.after.reliability >= 80, `safe goal held only ${safe.after.reliability} reliability, expected >= 80`);

// ---- the three goals are a ladder, not three names for the same map ---------------------------------
const street = optimise(randy, 'street'), race = optimise(randy, 'race');
assert(street.after.reliability >= safe.after.reliability,
  `the street map must not be less reliable than the 80-floor map (${street.after.reliability} vs ${safe.after.reliability})`);
assert(race.after.hp > safe.after.hp,
  `the race map must find more power than the 80-floor map (${Math.round(race.after.hp)} vs ${Math.round(safe.after.hp)})`);
assert(race.after.reliability < safe.after.reliability,
  'the race map buys its power with reliability');

// ---- a built engine may use the revs its parts are rated for ----------------------------------------
// The rev-limit and piston-speed bands used to start at 82 % of the rating, so 8000 rpm on parts rated to
// 8300 cost ~15 points before anything was wrong. The parts' own rating is the limit; approaching it is
// not a fault, exceeding it is.
const atRating = run(build('randy', s => { s.tune.revLimitRpm = 8000; }));
const wayUnder = run(build('randy', s => { s.tune.revLimitRpm = 7000; }));
assert(atRating.reliabilityScore >= wayUnder.reliabilityScore - 8,
  `8000 rpm on parts rated 8300 costs ${wayUnder.reliabilityScore - atRating.reliabilityScore} points, too much`);
const overRating = run(build('randy', s => { s.tune.revLimitRpm = 9200; }));
assert(overRating.reliabilityScore < atRating.reliabilityScore - 5,
  'revving past what the parts are rated for must still cost reliability');

// ---- knock: a working controller is not a defect ----------------------------------------------------
// The score used to charge `knockIndex * 24`, but a knock controller deliberately holds spark just under
// the limit, so every calibrated engine paid ~23 points for its ECU doing its job. What counts is how
// much spark is given up against MBT and whether the controller runs out of authority.
const onBlend = run(build('randy'));
const onPump = run(build('randy', s => { s.selections.fuel = 'ron95'; }));
assert(onPump.sparkDeficitFrac > onBlend.sparkDeficitFrac,
  'a worse fuel must give up more spark against MBT');
assert(onPump.reliabilityScore < onBlend.reliabilityScore,
  'running the wrong fuel must cost reliability');
assert(onBlend.maxKnockRisk > 0.8 && onBlend.reliabilityScore >= 75,
  'sitting at the knock limit under knock control is normal operation, not a 25-point fault');

// ---- pushing one turbo past its map still hurts -----------------------------------------------------
const sane = run(build('randy', s => { Object.assign(s.tune, { boostMidBar: 1.8, boostHighBar: 1.8, railTargetBar: 195 }); }));
const flogged = run(build('randy', s => { Object.assign(s.tune, { boostMidBar: 2.4, boostHighBar: 2.4, lambda: 0.88 }); }));
assert(flogged.reliabilityScore < sane.reliabilityScore - 15,
  `over-boosting a maxed turbo must cost real reliability (${flogged.reliabilityScore} vs ${sane.reliabilityScore})`);

// ---- compound boost: bottom end bought with a little top end ----------------------------------------
// The HP turbine bypass was sized at 1.1 x the LP turbine's flow, so wide open it still choked the
// exhaust: EMP 3.4 bar at 6000 rpm where the LP turbo alone makes 2.3, and the compound was slower
// everywhere above 4000 rpm. A compound must win low down and give up only a little up top.
const nmAt = (r, rpm) => (r.samples || []).reduce((a, b) => Math.abs(b.rpm - rpm) < Math.abs(a.rpm - rpm) ? b : a).torqueNm;
const single = run(build('randy'));
const compound = run(build('randy', s => { s.selections.turboHp = 'k03'; }));
assert(nmAt(compound, 2500) > nmAt(single, 2500) * 1.3,
  `a compound must transform the bottom end (${Math.round(nmAt(compound, 2500))} vs ${Math.round(nmAt(single, 2500))} Nm at 2500)`);
assert(nmAt(compound, 3000) > nmAt(single, 3000) * 1.3, 'and still be well ahead at 3000 rpm');
assert(nmAt(compound, 6000) > nmAt(single, 6000) * 0.94,
  `and give up only a little up top (${Math.round(nmAt(compound, 6000))} vs ${Math.round(nmAt(single, 6000))} Nm at 6000)`);
assert(compound.peakHp > single.peakHp * 0.93,
  `peak power must not collapse (${Math.round(compound.peakHp)} vs ${Math.round(single.peakHp)} pk)`);

// ---- the owner's K04 hybrid runs the 3 bar they say it runs ------------------------------------------
// The map is modelled, and it used the file's generic 560 m/s tip-speed fallback - a cast-wheel figure - so
// this billet wheel stopped at 2.87 bar with its shaft at 98 % of a limit that was itself the fallback.
// At 590 m/s, normal for billet, the same formulas give 174k rpm and a 4.4 pressure ratio. What it still
// takes is the hardware to hold it: boost control past 3 bar, an ignition that fires there, and the fuel.
const atThreeBar = extra => {
  const s = build('randy', st => {
    Object.assign(st.selections, extra);
    st.tune.boostMidBar = 3.0;
    st.tune.boostHighBar = 3.0;
  });
  const r = run(s);
  return { r, maxBoost: (r.samples || []).reduce((m, p) => Math.max(m, p.boostBar || 0), 0) };
};
const full = atThreeBar({ boostControl: 'dual_44', ignition: 'smart_coils', fuelSystem: 'di_mpi' });
assert(full.maxBoost >= 2.99,
  `the hybrid must reach the 3 bar gauge its owner runs (${full.maxBoost.toFixed(2)} bar)`);
assert.strictEqual(full.r.status, 'completed', `and survive the pull (${full.r.abortReason || ''})`);
assert(full.r.reliabilityScore >= 40, `at a usable reliability (${full.r.reliabilityScore})`);
// Each link in that chain is required: the wastegate, the spark and the fuel.
const onStockWastegate = atThreeBar({ ignition: 'smart_coils', fuelSystem: 'di_mpi' });
assert(onStockWastegate.maxBoost < 2.6,
  `an internal wastegate rated 2.35 bar cannot hold 3 (${onStockWastegate.maxBoost.toFixed(2)})`);
const onWeakSpark = atThreeBar({ boostControl: 'dual_44', fuelSystem: 'di_mpi' });
assert(onWeakSpark.r.status === 'aborted',
  'coils rated 2.2 bar must break down before 3 bar, not quietly cope');
const onSmallFuel = atThreeBar({ boostControl: 'dual_44', ignition: 'smart_coils' });
assert(onSmallFuel.maxBoost < full.maxBoost - 0.05 && onSmallFuel.r.maxFuelDuty > 99,
  `and the injectors must run out first (${onSmallFuel.maxBoost.toFixed(2)} bar at ${Math.round(onSmallFuel.r.maxFuelDuty)} % duty)`);

module.exports = {
  threeBarHp: Math.round(full.r.peakHp),
  goals: goals.length,
  tunerTouches: touched.length,
  safeGoal: { hp: Math.round(safe.after.hp), reliability: safe.after.reliability },
  raceGoal: { hp: Math.round(race.after.hp), reliability: race.after.reliability },
  compoundLowEndGainPct: Math.round((nmAt(compound, 2500) / nmAt(single, 2500) - 1) * 100)
};
