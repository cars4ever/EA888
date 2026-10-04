'use strict';
// The simulation against real passes (data/roster/calibration.json): the cars whose weight, power and timeslip
// fit together, run the way they ran (launch temperature, their driver, a documented lift). Tolerances follow
// from the data itself: the same car on the same day spreads 2-4 % in ET and up to 0.19 s in 60 ft, and dyno
// numbers do not say whether they are wheel or crank power (+-15 % power is +-5 % ET).
//   ET +-4 %, trap +-4 %, 60 ft +-0.10 s.
// A trap speed that was used to derive a car's weight or power is not tested (calibration.json says which).
// A deviation the model cannot close is listed below with the reason and a regression bound - the tolerance
// itself is never widened for it.
const assert = require('assert');
const { table, loadSim, TOL } = require('../tools/roster_calibration.js');

const KNOWN = {
  'crc12_jackstand_240.sixtyFt': {
    bound: 0.16,
    reason: 'launch torque over the first 60 ft depends on when the nitrous comes in (no controller in the research; the ' +
      'rule is 0.25 s delay + 1 s ramp), the converter multiplication and the rear gear. With the shot at the hit and a ' +
      '0.3 s ramp the same car runs a 1.278 60 ft; ET and trap stay within tolerance either way.'
  },
  'eagle.et': {
    bound: 0.4,
    reason: 'a 3,500 hp radial car is traction-limited for most of the quarter; the model has no aero downforce (its ' +
      'spoiler loads the rear tyres hardest at 200+ mph) and no lock-up converter (this car has one), its weight is the ' +
      "team's estimate from before the build and its power is derived from its own trap speed with Hale."
  },
  'eagle.sixtyFt': { bound: 0.4, reason: 'see eagle.et' }
};

const C = require('../src/assets/sim.js');
const after = table(C);
const before = table(loadSim(true));
const outside = [], known = [];
for (const r of after.filter(x => x.calibration)) {
  for (const k of r.metrics) {
    const c = r[k], key = `${r.id}.${k}`;
    assert(c.real != null && Number.isFinite(c.sim), `${key}: no comparison`);
    if (c.ok) continue;
    if (KNOWN[key]) {
      const dev = Math.abs(c.delta);
      assert(dev <= KNOWN[key].bound, `${key}: ${dev.toFixed(3)} beyond its documented bound ${KNOWN[key].bound} (${KNOWN[key].reason})`);
      known.push(key);
    } else outside.push(`${key}: real ${c.real} sim ${c.sim.toFixed(3)} (tolerance ${TOL[k]})`);
  }
}
assert.deepStrictEqual(outside, [], `outside tolerance:\n  ${outside.join('\n  ')}`);
// documented deviations must still be deviations: once one closes, it moves out of KNOWN
for (const key of Object.keys(KNOWN)) assert(known.includes(key), `${key} is within tolerance now: remove it from KNOWN`);

// The calibration made every tested number better (or kept it within tolerance).
for (const r of after.filter(x => x.calibration)) {
  const b = before.find(x => x.id === r.id);
  for (const k of r.metrics) {
    assert(r[k].ok || Math.abs(r[k].delta) < Math.abs(b[k].delta), `${r.id}.${k}: worse after the calibration`);
  }
}
// Every opponent finishes, and none beats its own real ET by more than the tolerance (the model is not faster
// than reality anywhere).
for (const r of after) {
  assert(Number.isFinite(r.et.sim) && r.et.sim > 3, `${r.id} did not finish`);
  if (r.et.real != null) assert(r.et.sim >= r.et.real * (1 - TOL.et), `${r.id}: ${r.et.sim.toFixed(2)} s is quicker than its real ${r.et.real}`);
}

console.log('PASS roster calibration tests');
module.exports = {
  tolerance: TOL,
  known: Object.fromEntries(known.map(k => [k, KNOWN[k].reason])),
  after: after.map(r => ({ id: r.id, et: [r.et.real, +r.et.sim.toFixed(3)], mph: [r.mph.real, +r.mph.sim.toFixed(1)], sixtyFt: [r.sixtyFt.real, +r.sixtyFt.sim.toFixed(3)] }))
};
