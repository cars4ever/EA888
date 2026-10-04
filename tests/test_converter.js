'use strict';
// Torque converter and planetary automatics (the roster's Powerglide / TH400 cars). Physical invariants of
// the converter itself, then a car with one on the shared race runtime. The player's gearboxes do not go
// through this path; a check at the end holds that.
const assert = require('assert');
const C = require('../src/assets/sim.js');

const rpmToW = rpm => (rpm * Math.PI) / 30;
const cv = C.converterSpec({ stallRpm: 5000, torqueNm: 700, torqueRatio: 1.8, couplingSr: 0.85 });

// stall: turbine held, the pump absorbs exactly the rated torque at the flash stall, multiplied at the turbine
const stall = C.converterTorques(cv, rpmToW(5000), 0);
assert(Math.abs(stall.pumpNm - 700) < 1e-6, `pump torque at stall ${stall.pumpNm}`);
assert(Math.abs(stall.turbineNm / stall.pumpNm - 1.8) < 1e-9, 'torque ratio at stall');
// torque multiplication falls to 1 at the coupling point and stays there
const atCoupling = C.converterTorques(cv, rpmToW(6000), rpmToW(6000 * 0.85));
assert(Math.abs(atCoupling.turbineNm / atCoupling.pumpNm - 1) < 1e-9, 'no multiplication at the coupling point');
// no slip, no torque; continuous across the coupling point; the pump torque grows with the square of speed
assert.strictEqual(C.converterTorques(cv, rpmToW(6000), rpmToW(6000)).pumpNm, 0, 'no torque without slip');
for (const at of [0.6, 0.85]) {
  const below = C.converterTorques(cv, rpmToW(6000), rpmToW(6000 * (at - 1e-4))), above = C.converterTorques(cv, rpmToW(6000), rpmToW(6000 * (at + 1e-4)));
  assert(Math.abs(below.pumpNm - above.pumpNm) / below.pumpNm < 0.01, `pump torque continuous at SR ${at}`);
}
// capacity falls past the knee: at fixed pump speed the pump takes less torque as the turbine catches up
assert(C.converterTorques(cv, rpmToW(6000), rpmToW(6000 * 0.9)).pumpNm < C.converterTorques(cv, rpmToW(6000), rpmToW(6000 * 0.7)).pumpNm, 'capacity knee');
assert(Math.abs(C.converterTorques(cv, rpmToW(6000), 0).pumpNm / 700 - Math.pow(6000 / 5000, 2)) < 1e-9, 'square law');
// it never makes power: turbine power <= pump power for every speed ratio up to 1
for (let sr = 0; sr <= 1.0001; sr += 0.01) {
  const t = C.converterTorques(cv, rpmToW(6000), rpmToW(6000 * sr));
  assert(t.turbineNm * sr <= t.pumpNm + 1e-6, `converter makes power at SR ${sr.toFixed(2)}`);
}
// overrun (turbine faster than the pump): it brakes, it does not drive
assert(C.converterTorques(cv, rpmToW(3000), rpmToW(3300)).turbineNm < 0, 'overrun brakes the turbine');

// A car with a Powerglide and converter on the race runtime (an EA888 build is enough to test the driveline).
function withPowerglide(preset, converter) {
  const st = C.applyPreset(C.blankState(), preset);
  st.vehicle = { ...st.vehicle, drivetrain: 'RWD', tireCompound: 'drag_radial', preparedTrack: true, pressureBar: 1.25 };
  st.rosterCar = { transmission: { id: 'powerglide', name: 'Powerglide', gearRatios: [1.76, 1.0], finalDrive: 4.1, transEfficiency: 0.93,
    shiftSeconds: 0.12, driveline: { type: 'converter', converter } } };
  return C.normalizeState(st);
}
const st = withPowerglide('hx52', C.converterSpec({ stallRpm: 4800, torqueNm: 450, torqueRatio: 1.8, couplingSr: 0.85 }));
assert.deepStrictEqual(C.effectiveGearing(st).gears, [1.76, 1.0], 'gearing follows the roster gearbox');
const rt = C.createRaceRuntime(st, { tyreTempC: 55, launchRpm: 7000 });
for (let i = 0; i < 150; i++) rt.step(0.01, {});
const staged = rt.point();
// on the transbrake: the car does not move, the engine sits where its torque meets the pump
assert.strictEqual(staged.speedKmh, 0, 'car moves on the transbrake');
const pumpAtStage = C.converterTorques(rt.driveline.converter, rpmToW(staged.rpm), 0).pumpNm;
assert(Math.abs(pumpAtStage - staged.torqueNm) / Math.max(1, staged.torqueNm) < 0.05,
  `engine (${staged.torqueNm.toFixed(0)} Nm) and pump (${pumpAtStage.toFixed(0)} Nm) not balanced at ${staged.rpm.toFixed(0)} rpm on the transbrake`);
assert(staged.converter && staged.converter.heatKJ > 0, 'stalling the converter heats the fluid');

const run = C.simulateRaceRun(st, { reactionTime: 0, tyreTempC: 55 });
assert(Number.isFinite(run.quarter) && run.quarter > 6 && run.quarter < 20, `quarter ${run.quarter}`);
assert(run.trace.every(p => Number.isFinite(p.rpm) && Number.isFinite(p.speedKmh)), 'NaN in the trace');
assert.strictEqual(run.shifts, 1, 'a Powerglide shifts once');
// a converter car leaves at its stall: the engine never drops toward idle off the line
const offLine = run.trace.filter(p => p.distanceM > 0.5 && p.distanceM < 18);
assert(offLine.every(p => p.rpm > 3000), 'engine bogged below 3000 rpm through the converter');
// at the line the race converter slips a few percent, it does not lock
const fin = C.createRaceRuntime(st, { tyreTempC: 55, launchRpm: 7000 });
for (let i = 0; i < 150; i++) fin.step(0.01, {});
fin.launch();
let last = null;
while (fin.state.x < 402.336 && fin.state.t < 30) {
  last = fin.step(0.01, { pedal: 1 });
  if (!fin.state.shift && last.gearIndex < fin.gears.length - 1 && last.rpm > 7000) fin.requestShift();
}
const slipPct = (1 - last.converter.speedRatio) * 100;
assert(slipPct > 1 && slipPct < 15, `converter slip at the line ${slipPct.toFixed(1)} %`);

// The player's gearbox does not change by any of this.
const player = C.applyPreset(C.blankState(), 'randy');
assert.strictEqual(C.transmissionFor(player).id, C.getPart(player, 'transmission').id, 'player gearbox lookup changed');
assert.strictEqual(C.drivelineFor(player), C.DRIVELINE[C.getPart(player, 'transmission').id], 'player driveline lookup changed');

console.log('PASS converter tests');
module.exports = { stagedRpm: Math.round(staged.rpm), quarter: run.quarter, trapKmh: Math.round(run.trapKmh), sixtyFt: run.sixtyFt, slipAtLinePct: +slipPct.toFixed(1) };
