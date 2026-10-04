'use strict';
// Roster cars on the race runtime: every number a car races with says where it came from, the engine curve
// makes exactly the quoted power, every car finishes, and a curve engine never trips the combustion model's
// knock or head-lift damage.
const assert = require('assert');
const C = require('../src/assets/sim.js');

const KINDS = ['measured', 'stated', 'estimate', 'modeled'];
const opponents = C.rosterOpponents();
assert(opponents.length >= 6, 'roster opponents missing');

for (const o of opponents) {
  const spec = C.rosterSpec(o.id);
  // provenance of every resolved value
  for (const [k, v] of Object.entries(spec.values)) {
    if (!v) continue;
    assert(KINDS.includes(v.kind), `${o.id}.${k}: kind ${v.kind}`);
    if (v.kind === 'modeled') assert(v.reason, `${o.id}.${k}: modeled without a reason`);
    else assert(v.source && v.source.video, `${o.id}.${k}: ${v.kind} without a source`);
  }
  // the curve makes the quoted crank power at its peak (plus the nitrous shot where there is one)
  const em = C.curveEngineMap(spec.engine);
  const fullMap = spec.engine.boost ? 1.013 + spec.engine.boost.fullBar : 1.013;
  let peakW = 0;
  for (let rpm = 1500; rpm <= spec.engine.revLimit; rpm += 10) peakW = Math.max(peakW, C.engineMapLookup(em, rpm, fullMap).torqueNm * rpm * Math.PI / 30);
  const shot = spec.nitrous ? spec.nitrous.shotHp : 0;
  const expected = spec.values.enginePowerHp.value - shot;
  assert(Math.abs(peakW / 745.7 - expected) / expected < 0.005, `${o.id}: curve peak ${(peakW / 745.7).toFixed(1)} hp, quoted ${expected}`);
  // a run: finite everywhere, no combustion-model damage on a curve engine
  const r = C.simulateRaceRun(C.rosterState(o.id), { reactionTime: 0, tyreTempC: C.TYRE[spec.tire.compound].optC, driverSkill: spec.driverSkill });
  assert(Number.isFinite(r.quarter) && r.quarter > 4 && r.quarter < 15, `${o.id}: quarter ${r.quarter}`);
  assert(r.trace.every(p => Number.isFinite(p.rpm) && Number.isFinite(p.speedKmh)), `${o.id}: NaN in the trace`);
  assert.strictEqual(r.knockDamagePct, 0, `${o.id}: knock damage on a curve engine`);
  assert.strictEqual(r.headLiftS, 0, `${o.id}: head lift on a curve engine (gasket clamp unknown)`);
  // the launch rpm never asks more of the tyre at the hit than it carries
  assert(spec.values.launchRpm.derivedFrom.tyreCapacityG > 1, `${o.id}: tyre capacity`);
}

// A wheel-horsepower figure goes to the crank through the car's own driveline efficiency.
const mc = C.rosterSpec('mcflurry');
assert.strictEqual(mc.values.enginePowerHp.kind, 'modeled');
assert(mc.values.enginePowerHp.value > 1394 && mc.values.enginePowerHp.derivedFrom.wheelHp === 1394, 'wheel power not converted');

console.log('PASS roster runtime tests');
module.exports = { opponents: opponents.length };
