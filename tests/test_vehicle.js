'use strict';
// Vehicle model invariants (sim.js createRaceRuntime / simulateRaceRun): the same code drives the player's
// realtime race and every rival.
const assert = require('assert');
const C = require('../src/assets/sim.js');
const between = (v, lo, hi, label) => assert(Number.isFinite(v) && v >= lo && v <= hi, `${label}: ${v} not in [${lo}, ${hi}]`);
const build = (preset, mutate) => { const s = C.applyPreset(C.blankState(), preset); if (mutate) mutate(s); return C.normalizeState(s); };
const pass = (s, cfg = {}) => C.simulateRaceRun(s, { reactionTime: 0.1, driverSkill: 1, ...cfg });

const stockState = build('stock', s => { s.vehicle.tireCompound = 'uhp'; s.vehicle.preparedTrack = false; });

// 2. Stock CAWB Scirocco against the factory figure (VW: 0-100 km/h 7.2 s, 6MT) and typical timeslips.
const stock = pass(stockState);
between(stock.zeroTo100, 6.7, 7.8, 'stock 0-100 km/h (VW 7.2 s)');
between(stock.quarter, 14.6, 15.8, 'stock quarter mile');
between(stock.trapKmh, 148, 162, 'stock trap speed');

// 3. Trap speed follows power-to-weight (Hale: mph = 234 (hp/lb)^(1/3)) within ~6 %.
for (const [preset, mutate] of [['stock', null], ['randy', s => { s.vehicle.tireCompound = 'drag_radial'; s.vehicle.preparedTrack = true; }], ['hx52', s => { s.vehicle.tireCompound = 'drag_radial'; s.vehicle.preparedTrack = true; }]]) {
  const s = build(preset, mutate);
  const r = pass(s), hp = C.simulateEngine(s, { noise: false }).peakHp * 0.986, lb = r.totalMassKg * 2.2046;
  const hale = 234 * Math.cbrt(hp / lb) * 1.609;
  between(r.trapKmh / hale, 0.94, 1.06, `${preset} trap vs Hale`);
}

// 4. Traction: prepared track + drag radials beat street tyres off the line; AWD puts big power down
//    better than FWD, whose front axle unloads under acceleration.
const randyStreet = pass(build('randy', s => { s.vehicle.tireCompound = 'uhp'; s.vehicle.preparedTrack = false; }));
const randyDrag = pass(build('randy', s => { s.vehicle.tireCompound = 'drag_radial'; s.vehicle.preparedTrack = true; }));
assert(randyDrag.sixtyFt < randyStreet.sixtyFt - 0.15, `drag radials on prep must launch harder (${randyDrag.sixtyFt} vs ${randyStreet.sixtyFt})`);
const bigFwd = pass(build('pro98', s => { s.vehicle.drivetrain = 'FWD'; s.vehicle.tireCompound = 'pro_radial'; s.vehicle.preparedTrack = true; }));
const bigAwd = pass(build('pro98', s => { s.vehicle.drivetrain = 'AWD'; s.vehicle.tireCompound = 'pro_radial'; s.vehicle.preparedTrack = true; }));
assert(bigAwd.sixtyFt < bigFwd.sixtyFt && bigAwd.quarter < bigFwd.quarter, 'AWD must put ~1000 pk down better than FWD');
const rt = C.createRaceRuntime(build('randy'), {});
for (let i = 0; i < 50; i++) rt.step(0.02, {});
rt.launch();
let minTransfer = 0;
for (let i = 0; i < 100; i++) { rt.step(0.01, {}); minTransfer = Math.max(minTransfer, rt.state.transfer); }
assert(minTransfer > 800, 'acceleration must transfer load off the front axle');

// 5. Traction control holds slip near the tyre's peak; without it a big FWD spins far more.
const tcOn = pass(build('randy', s => { s.vehicle.tireCompound = 'uhp'; }), { tractionControl: true, driverSkill: 0 });
const tcOff = pass(build('randy', s => { s.vehicle.tireCompound = 'uhp'; }), { tractionControl: false, driverSkill: 0 });
assert(tcOn.wheelspinPct <= tcOff.wheelspinPct, 'traction control must not add wheelspin');

// 6. Clutch: launching higher slips longer and heats the clutch more.
const low = pass(build('randy', s => { s.tune.launchRpm = 3000; }));
const high = pass(build('randy', s => { s.tune.launchRpm = 6500; }));
assert(high.maxClutchTempC > low.maxClutchTempC + 10, 'a higher launch rpm must put more heat into the clutch');

// 7. Gearboxes: a DSG shifts without the torque gap of an H-pattern box.
const dsg = pass(build('stock', s => { s.selections.transmission = 'dq250'; s.vehicle.tireCompound = 'uhp'; }));
assert(dsg.quarter < stock.quarter, 'DQ250 must beat the manual 6MT on the same engine');

// 8. The race runs on the engine model, not on the dyno samples: a spark map change moves the pass.
const retarded = build('randy', s => { s.vehicle.tireCompound = 'drag_radial'; s.vehicle.preparedTrack = true; });
retarded.tune.ecu.spark = retarded.tune.ecu.spark.map(r => r.map(v => v - 8));
retarded.tune.ecu.edited.spark = true;
const mapBase = C.buildEngineMap(build('randy', s => { s.vehicle.tireCompound = 'drag_radial'; s.vehicle.preparedTrack = true; })), mapRet = C.buildEngineMap(retarded);
assert(C.engineMapLookup(mapRet, 6000, 2.8).torqueNm < C.engineMapLookup(mapBase, 6000, 2.8).torqueNm * 0.97, 'the race engine map must follow the spark table');
// ~5 % torque is ~1.7 % trap speed (trap ~ power^(1/3))
assert(pass(retarded).trapKmh < randyDrag.trapKmh - 1.5, '8 deg less spark must cost trap speed in the race too');

// 9. Legacy quick pass uses the same model and keeps its contract.
const quick = C.simulateDrag(build('randy'), C.simulateEngine(build('randy'), { noise: false }), { reactionTime: 0.08 });
assert(quick.quarter > 9 && quick.quarter < 16 && quick.valid && Number.isFinite(quick.setup.densityAltitudeM), 'quick pass contract');

module.exports = { stock: { zeroTo100: +stock.zeroTo100.toFixed(2), quarter: +stock.quarter.toFixed(2), trapKmh: Math.round(stock.trapKmh) } };
console.log('PASS vehicle model tests');
