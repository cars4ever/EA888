'use strict';
// Physical invariants of the engine model (engine.js) and its use in the dyno (sim.js).
// These tests pin the physics, not particular outputs: each assertion is a property a real engine has.
const assert = require('assert');
const E = require('../src/assets/engine.js');
const C = require('../src/assets/sim.js');
const D = E.DATA;

const geo = E.makeGeometry({ boreMm: 82.5, strokeMm: 92.8, rodMm: 144, compressionRatio: 9.6, cylinders: 4 });
const f98 = E.fuelBlend(D.fuelGrades.ron98), f95 = E.fuelBlend(D.fuelGrades.ron95), e85 = E.fuelBlend(D.fuelGrades.e85);
const head = D.heads.oem_head;
const op = (o = {}) => E.operatingPoint({ geo, head, rpm: 4000, mapBarAbs: 2.0, manifoldK: 318, empBarAbs: 2.6, lambda: 0.82, fuel: f98, camAdvanceDeg: 20, exhaustK: 1150, stepDeg: 1, ...o });
const between = (v, lo, hi, label) => assert(Number.isFinite(v) && v >= lo && v <= hi, `${label}: ${v} not in [${lo}, ${hi}]`);

// 1. Geometry: EA888 CAWB 82.5 x 92.8 mm = 1984 cc.
between(geo.displacementL * 1000, 1982, 1986, 'CAWB displacement cc');

// 2. Fuel blends (handbook components, octane linear in molar fraction).
between(e85.afrSt, 9.6, 10.0, 'E85 stoichiometric AFR');
between(e85.ron, 104, 109, 'E85 RON');
between(e85.lhvMJkg, 28.5, 30.0, 'E85 lower heating value');
assert(e85.hfgKJkg > 2 * f98.hfgKJkg, 'ethanol blends need far more heat to evaporate');
// Energy per kg of stoichiometric air is nearly fuel-independent: power follows air, not fuel.
between((e85.lhvMJkg / e85.afrSt) / (f98.lhvMJkg / f98.afrSt), 0.98, 1.04, 'energy per kg air, E85 vs 98');
between(f98.ron, 97.5, 98.5, '98 RON grade');
between(f95.ron, 94.5, 95.5, '95 RON grade');
// Kalghatgi: under boost (K < 0) a high-sensitivity fuel is worth more than its RON.
const oiE85 = E.octaneIndex(e85, 3.0).oi, oi98 = E.octaneIndex(f98, 3.0).oi;
assert(oiE85 - oi98 > e85.ron - f98.ron, 'E85 octane advantage must grow under boost (octane index)');

// 3. Spark timing: torque peaks at MBT; retarding costs torque and raises exhaust temperature.
const mbt = op({ sparkCmdDeg: null, knockControl: { enabled: false } });
const retard10 = op({ sparkCmdDeg: mbt.mbtDeg - 10, mbtDeg: mbt.mbtDeg });
const advance8 = op({ sparkCmdDeg: mbt.mbtDeg + 8, mbtDeg: mbt.mbtDeg });
between(1 - retard10.torqueNm / mbt.torqueNm, 0.02, 0.12, 'torque loss for 10 deg retard from MBT');
assert(advance8.torqueNm < mbt.torqueNm, 'advance beyond MBT must lose torque');
assert(retard10.egtC > mbt.egtC + 20, 'retarded combustion must raise exhaust temperature');
between(mbt.ca50Deg, 4, 14, 'CA50 at MBT (deg ATDC)');
assert(advance8.knockIndex > mbt.knockIndex && mbt.knockIndex > retard10.knockIndex, 'knock index must rise with spark advance');

// 4. Mixture: maximum torque slightly rich of stoichiometric; lean and very rich lose torque.
const lam = l => op({ lambda: l, sparkCmdDeg: 5, mbtDeg: 20, findKnockLimit: false }).torqueNm;
const t100 = lam(1.0), t085 = lam(0.85), t070 = lam(0.7), t110 = lam(1.1);
assert(t085 > t100 && t085 > t070 && t100 > t110, `torque vs lambda: 0.85=${t085.toFixed(0)} 1.0=${t100.toFixed(0)} 0.7=${t070.toFixed(0)} 1.1=${t110.toFixed(0)}`);
// Rich mixtures cool the exhaust.
assert(op({ lambda: 0.75, sparkCmdDeg: 5, mbtDeg: 20, findKnockLimit: false }).egtC < op({ lambda: 0.95, sparkCmdDeg: 5, mbtDeg: 20, findKnockLimit: false }).egtC, 'richer mixture must lower EGT');

// 5. Efficiency and fuel consumption stay in the range of real SI engines.
between(mbt.bsfcGkWh, 210, 330, 'full-load BSFC at MBT, g/kWh');
between(mbt.heatLossFrac, 0.05, 0.3, 'in-cylinder wall heat loss fraction');
const pts = [1500, 3000, 4500, 6000].map(rpm => op({ rpm, sparkCmdDeg: 10, mbtDeg: 20, findKnockLimit: false }).fmepBar);
assert(pts.every((v, i) => i === 0 || v > pts[i - 1]), 'friction must rise with rpm (Chen-Flynn)');
assert(op({ viscosityFactor: 1.2, sparkCmdDeg: 10, mbtDeg: 20 }).fmepBar > op({ viscosityFactor: 0.85, sparkCmdDeg: 10, mbtDeg: 20 }).fmepBar, 'thicker oil must add friction');

// 6. Breathing: more manifold pressure = more air and torque; exhaust backpressure costs air and adds residual.
assert(op({ mapBarAbs: 2.4, empBarAbs: 3.1, sparkCmdDeg: 8, mbtDeg: 20 }).torqueNm > op({ mapBarAbs: 2.0, empBarAbs: 2.6, sparkCmdDeg: 8, mbtDeg: 20 }).torqueNm, 'boost must add torque');
const bpLow = E.breathing({ geo, head, rpm: 5000, mapBarAbs: 2.0, empBarAbs: 2.0, manifoldK: 318 });
const bpHigh = E.breathing({ geo, head, rpm: 5000, mapBarAbs: 2.0, empBarAbs: 3.2, manifoldK: 318 });
assert(bpHigh.ve < bpLow.ve && bpHigh.xr > bpLow.xr, 'backpressure must lower VE and raise residual gas');
// Inlet Mach index: VE falls at high piston speed; ported heads with bigger valves keep breathing.
const veAt = (h, rpm) => E.breathing({ geo, head: D.heads[h], rpm, mapBarAbs: 2.0, empBarAbs: 2.4, manifoldK: 318, camAdvanceDeg: D.heads[h].camRefDeg }).ve;
assert(veAt('oem_head', 7500) < veAt('oem_head', 4500), 'OEM head VE must fall at high rpm');
assert(veAt('ported_head', 8500) > veAt('oem_head', 8500), 'ported head must breathe better at high rpm');
// Cam phasing: advancing the intake cam helps low rpm, costs high rpm.
const cam = (adv, rpm) => E.breathing({ geo, head, rpm, mapBarAbs: 1.8, empBarAbs: 1.9, manifoldK: 318, camAdvanceDeg: adv }).ve;
assert(cam(30, 2000) > cam(5, 2000) && cam(30, 6500) < cam(5, 6500), 'intake cam advance: better low, worse high');
// Humidity: only dry air burns fuel.
assert(E.dryAirBar(1.013, 30, 90) < E.dryAirBar(1.013, 30, 10), 'humid air has less dry-air pressure');

// 7. Knock: calibration points (see data/engine/calibration.json) within 3 deg.
const klsaAt = (rpm, map, er, tk, fuel, h) => {
  const o = E.operatingPoint({ geo, head: D.heads[h], rpm, mapBarAbs: map, manifoldK: tk, empBarAbs: map * er, lambda: 0.8, fuel, camAdvanceDeg: 10, exhaustK: 1150, stepDeg: 2 });
  return Math.min(o.klsaDeg ?? 60, o.mbtDeg);
};
const KNOCK_POINTS = [
  [2000, 1.9, 1.1, 318, f98, 'oem_head', 5], [3500, 1.95, 1.4, 322, f98, 'oem_head', 9], [5000, 1.95, 1.45, 323, f98, 'oem_head', 13],
  [6000, 1.8, 1.45, 320, f98, 'oem_head', 17.5], [5000, 2.6, 1.7, 317, f98, 'mild_cams', 9], [7500, 2.9, 1.65, 309, f95, 'randy_catcams', 15.5],
  [7000, 2.8, 1.6, 306, f98, 'randy_catcams', 17.5], [5500, 2.9, 1.7, 306, e85, 'randy_catcams', 22], [7000, 3.4, 1.7, 310, e85, 'randy_catcams', 24]
];
for (const [rpm, map, er, tk, fuel, h, target] of KNOCK_POINTS) between(klsaAt(rpm, map, er, tk, fuel, h), target - 3, target + 3, `knock-limited spark ${rpm} rpm ${map} bar`);
// Physical trends of the knock limit.
assert(klsaAt(4000, 2.6, 1.5, 318, e85, 'oem_head') > klsaAt(4000, 2.6, 1.5, 318, f98, 'oem_head') + 5, 'E85 must allow much more advance than 98');
assert(klsaAt(4000, 2.6, 1.5, 345, f98, 'oem_head') < klsaAt(4000, 2.6, 1.5, 305, f98, 'oem_head'), 'hot charge air must knock earlier');
assert(klsaAt(4000, 2.6, 1.5, 318, f95, 'oem_head') < klsaAt(4000, 2.6, 1.5, 318, f98, 'oem_head'), 'lower octane must knock earlier');
assert(klsaAt(4000, 2.8, 1.5, 318, f98, 'oem_head') < klsaAt(4000, 2.2, 1.5, 318, f98, 'oem_head'), 'more boost must knock earlier');

// 8. Fuel delivery hardware.
const oemSys = D.fuelSystems.oem_fuel;
const fd = (rpm, kgS, sys = oemSys, rail = 150) => E.fuelDelivery(sys, { rpm, demandKgS: kgS, fuel: f98, railTargetBar: rail, mapBarAbs: 2.0 });
assert(fd(3000, 0.004).railBar === 150 && fd(3000, 0.004).shortfallPct === 0, 'light demand: target rail, no shortfall');
assert(fd(3000, 0.03).railBar < 150, 'pump saturation must drop the rail pressure');
assert(fd(6000, 0.03).deliveredKgS > fd(3000, 0.03).deliveredKgS, 'cam-driven HPFP delivery rises with rpm');
assert(fd(6000, 0.03, D.fuelSystems.randy_nostrum_rsx, 190).deliveredKgS > fd(6000, 0.03).deliveredKgS, 'Nostrum + RSX must out-flow the OEM system');
assert(E.fuelDelivery(D.fuelSystems.di_mpi, { rpm: 7000, demandKgS: 0.05, fuel: e85, railTargetBar: 170, mapBarAbs: 2.5 }).mpiDutyPct > 0, 'port injection must take over above DI capacity');
// OEM fuel system saturates near 280-320 PS on 98 (fuel at ~BSFC 330 g/kWh).
const oemCapKgS = fd(6000, 1).deliveredKgS;
between((oemCapKgS * 3.6e6 / 330) * 1.36, 260, 340, 'OEM fuel system capability, PS');

// 9. Dyno (sim.js) uses the model end to end.
const stock = C.simulateEngine(C.applyPreset(C.blankState(), 'stock'), { noise: false });
const s4000 = stock.samples.find(p => p.rpm === 4000);
for (const k of ['sparkDeg', 'mbtDeg', 'knockIndex', 'pMaxBar', 'ca50Deg', 'imepBar', 'fmepBar', 'pmepBar', 'diDutyPct', 'bsfcGkWh', 'volumetricEff'])
  assert(Number.isFinite(s4000[k]), `dyno sample must carry ${k}`);
between(s4000.volumetricEff, 0.8, 1.05, 'stock VE at 4000 rpm');
between(s4000.egtC, 800, 1000, 'stock EGT at 4000 rpm');
assert(s4000.sparkDeg <= s4000.mbtDeg + 1e-9, 'ECU spark never beyond MBT on the base map');
// Knock control holds the end gas below auto-ignition; knock protection lowers boost when retard is exhausted.
assert(stock.samples.every(p => p.knockIndex < 1.05), 'knock control must keep the knock index at the limit');
// A 98 mm compressor on 2.0 L surges: the engine cannot flow enough air for its map at any reachable rpm.
const huge = C.applyPreset(C.blankState(), 'pro98');
huge.selections.turbo = 'pt9803';
const hugeR = C.simulateEngine(huge, { noise: false });
assert(hugeR.samples.filter(p => p.rpm >= 7000).every(p => p.boostLimitedBy === 'surge' || /spool/.test(p.boostLimitedBy)), '98 mm on 2.0 L must be surge/spool limited');
assert(hugeR.peakHp < C.simulateEngine(C.applyPreset(C.blankState(), 'pro98'), { noise: false }).peakHp, 'the matched 86 mm must make more power than the 98 mm on 2.0 L');
// Humid air at the dyno costs power (dry-air partial pressure).
const dry = C.applyPreset(C.blankState(), 'stock'), wet = C.applyPreset(C.blankState(), 'stock');
dry.dynoConfig.humidityPct = 10; wet.dynoConfig.humidityPct = 95; dry.dynoConfig.ambientTempC = wet.dynoConfig.ambientTempC = 30;
assert(C.simulateEngine(wet, { noise: false }).samples.find(p => p.rpm === 3000).torqueNm < C.simulateEngine(dry, { noise: false }).samples.find(p => p.rpm === 3000).torqueNm, 'humidity must cost torque');

// 10. ECU tables: quick setup drives untouched tables; edits are kept; the base map follows the fuel.
const q = C.applyPreset(C.blankState(), 'randy');
q.tune.boostMidBar = 1.2;
const qn = C.normalizeState(q);
assert(Math.abs(qn.tune.ecu.boost[3][qn.tune.ecu.rpmAxis.indexOf(5000)] - 1.2) < 0.05, 'quick boost must flow into the boost table');
qn.tune.ecu.boost[3] = qn.tune.ecu.boost[3].map(() => 0.5);
qn.tune.ecu.edited.boost = true;
qn.tune.boostMidBar = 1.9;
assert(C.normalizeState(qn).tune.ecu.boost[3].every(v => v === 0.5), 'a hand-edited boost table must not be overwritten by quick setup');
const onE85 = C.normalizeState(C.applyPreset(C.blankState(), 'randy'));
onE85.selections.fuel = 'e85';
const regen = C.regenerateBaseMap(onE85);
const li = regen.tune.ecu.loadAxis.indexOf(3.0), ci = regen.tune.ecu.rpmAxis.indexOf(5000);
assert(regen.tune.ecu.spark[li][ci] > onE85.tune.ecu.spark[li][ci] + 3, 'an E85 base map must carry more advance at 3 bar abs than the E20 map');

// 11. Dyno measurement: correction standards, wheel vs engine power, heat soak between pulls.
between(C.correctionFactor('din70020', 20, 101.3, 50), 0.999, 1.001, 'DIN 70020 at its reference (20 C, 1013 mbar)');
between(C.correctionFactor('sae_j1349', 25, 101.3, 30), 0.98, 1.0, 'SAE J1349 near reference');
assert(C.correctionFactor('din70020', 35, 97, 50) > 1.05, 'hot, low-pressure air must correct upward');
const ref = C.simulateEngine(C.applyPreset(C.blankState(), 'randy'), { noise: false });
between(1 - ref.peakWheelHp / ref.peakHp, 0.1, 0.2, 'FWD chassis-dyno loss share');
for (const p of ref.samples) assert(p.wheelHp < p.hp, 'wheel power must be below engine power');
let th = C.applyPreset(C.blankState(), 'randy');
const r0 = C.simulateEngine(th, { soakK: C.dynoSoakAt(th, 1e6) });
th = C.commitDynoResult(th, r0, { nowMs: 1e6 });
const soak1 = C.dynoSoakAt(th, 1e6 + 60e3);
const r1 = C.simulateEngine(th, { soakK: soak1, noise: false }), r1cold = C.simulateEngine(th, { soakK: 0, noise: false });
assert(soak1 > 1 && r1.maxIatC > r1cold.maxIatC && r1.peakHp < r1cold.peakHp, 'a back-to-back pull must be heat soaked');
assert(C.dynoSoakAt(th, 1e6 + 30 * 60e3) < 0.2 * soak1, 'heat soak must decay with fan time');
const repA = C.simulateEngine(C.applyPreset(C.blankState(), 'randy'), { pullIndex: 1 }), repB = C.simulateEngine(C.applyPreset(C.blankState(), 'randy'), { pullIndex: 2 });
assert(repA.peakHp !== repB.peakHp && Math.abs(repA.peakHp / repB.peakHp - 1) < 0.02, 'repeat pulls scatter within ~2 %');

module.exports = { knockPoints: KNOCK_POINTS.length };
console.log('PASS engine model tests');
